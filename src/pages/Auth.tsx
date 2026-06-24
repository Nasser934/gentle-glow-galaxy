import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Logo, LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.96h5.5c-.24 1.42-1.7 4.16-5.5 4.16-3.31 0-6-2.74-6-6.12s2.69-6.12 6-6.12c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.84 3.6 14.65 2.6 12 2.6 6.86 2.6 2.7 6.76 2.7 11.9s4.16 9.3 9.3 9.3c5.37 0 8.93-3.78 8.93-9.1 0-.61-.07-1.08-.16-1.55H12z"/>
  </svg>
);

const AuthPage = () => {
  const navigate = useNavigate();
  const loc = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectTo = (loc.state as any)?.from || "/analyze";

  useEffect(() => {
    if (!authLoading && user) navigate(redirectTo, { replace: true });
  }, [user, authLoading, navigate, redirectTo]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/analyze",
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Check your email to verify your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e?.message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + redirectTo });
      if (result.error) throw result.error;
    } catch (e: any) {
      toast.error(e?.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Logo to="/" size={20} />
          <ThemeToggle />
        </div>
      </nav>

      <div className="grid min-h-[calc(100vh-3.5rem)] lg:grid-cols-2">
        {/* Left — form */}
        <div className="flex items-center justify-center px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-sm"
          >
            <h1 className="text-[22px] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Sign in to your Concept AI workspace.
            </p>

            <Button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="mt-6 h-10 w-full justify-center gap-2 rounded-md border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted"
            >
              <GoogleIcon /> Continue with Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>

            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4">
                <form onSubmit={handleEmail} className="space-y-3">
                  <div>
                    <Label htmlFor="e1">Email address</Label>
                    <Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div>
                    <Label htmlFor="p1">Password</Label>
                    <Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-4">
                <form onSubmit={handleEmail} className="space-y-3">
                  <div><Label htmlFor="n2">Name</Label><Input id="n2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></div>
                  <div><Label htmlFor="e2">Email address</Label><Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  <div><Label htmlFor="p2">Password</Label><Input id="p2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <p className="mt-5 text-[11px] text-muted-foreground">
              Secure workspace for your ideas, reports, and decisions. Not financial advice.
            </p>
          </motion.div>
        </div>

        {/* Right — brand panel */}
        <div className="relative hidden overflow-hidden border-l border-border bg-[hsl(var(--primary-dark))] lg:flex lg:items-center lg:justify-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,hsl(var(--primary)/0.4),transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_80%_80%,hsl(var(--accent)/0.18),transparent_60%)]" />
          <div className="relative flex flex-col items-center gap-6 text-primary-foreground">
            <div className="rounded-2xl bg-primary-foreground/10 p-5 ring-1 ring-inset ring-primary-foreground/20">
              <LogoMark size={72} className="text-primary-foreground" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold tracking-tight">Concept AI</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground/70">
                Feasibility Intelligence
              </div>
            </div>
            <p className="max-w-xs text-center text-[13px] leading-relaxed text-primary-foreground/80">
              Turn ideas into confident decisions — structured FMART scoring, sourced research,
              and exportable reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
