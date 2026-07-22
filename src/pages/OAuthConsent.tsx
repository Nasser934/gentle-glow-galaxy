import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";

// Beta namespace not yet in the JS SDK types — wrap only the three methods we need.
type OAuthAuthorizationDetails = {
  client?: { name?: string; client_id?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthorizationDetails | null; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: any }>;
};
const oauthApi = (): OAuthNs => (supabase.auth as unknown as { oauth: OAuthNs }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authorizationId) {
      setError("Missing authorization_id");
      return;
    }
    if (!user) {
      // Preserve full consent URL so the user returns here after sign-in.
      const next = window.location.pathname + window.location.search;
      navigate("/auth", { replace: true, state: { from: next } });
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message ?? "Could not load authorization request");
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load authorization request");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, user, authLoading, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const { data, error } = approve
        ? await oauthApi().approveAuthorization(authorizationId)
        : await oauthApi().denyAuthorization(authorizationId);
      if (error) {
        setError(error.message ?? "Authorization failed");
        setBusy(false);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setError("No redirect returned by the authorization server.");
        setBusy(false);
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setError(e?.message ?? "Authorization failed");
      setBusy(false);
    }
  }

  if (authLoading || (!details && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const clientName = details?.client?.name ?? "an external app";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border">
        <div className="container mx-auto flex h-14 items-center px-6">
          <Logo to="/" size={20} />
        </div>
      </nav>
      <main className="mx-auto max-w-lg px-6 py-12">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wider">Authorize connection</span>
          </div>

          {error ? (
            <div className="mt-4 space-y-3">
              <h1 className="text-lg font-semibold">Could not authorize</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to workspace</Button>
            </div>
          ) : (
            <>
              <h1 className="mt-3 text-lg font-semibold">
                Connect {clientName} to Concept AI
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {clientName} will be able to call this app's enabled tools while you are signed in as{" "}
                <span className="font-medium text-foreground">{user?.email}</span>.
              </p>

              <div className="mt-5 space-y-2 rounded-md border border-border bg-muted/40 p-4 text-sm">
                <p className="font-medium">This lets {clientName}:</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>Read your feasibility reports and comments</li>
                  <li>Post comments as you</li>
                  <li>Change the status of reports you own</li>
                </ul>
                {scopes.length > 0 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Requested identity scopes: {scopes.join(", ")}
                  </p>
                )}
                <p className="pt-2 text-xs text-muted-foreground">
                  This does not bypass this app's permissions or database policies.
                </p>
              </div>

              <div className="mt-6 flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                </Button>
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                  Cancel connection
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
