import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import { containsBlockedConsumerLanguage } from "@/lib/consumerSafety";
import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { toast } from "sonner";

type AdminReportRow = {
  id: string;
  title: string;
  industry: string | null;
  user_id: string;
  is_public: boolean;
  created_at: string;
  inputs: ConceptInputs;
  output: FeasibilityReport;
};

const statusTone = (status: string) =>
  status === "Pass" ? "bg-success text-success-foreground" : status === "Warning" ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";

function scoreReport(row: AdminReportRow) {
  const result = validateTemplateIntegrity(row.inputs, row.output);
  const blockedConsumerLanguage = containsBlockedConsumerLanguage({
    executiveSummary: row.output.executiveSummary,
    recommendations: row.output.recommendations,
    nextSteps: row.output.nextSteps,
    research: row.output.research,
  });
  const sourceCount = row.output.research?.citations?.length ?? 0;
  const blocking = result.issues.filter((issue) => issue.severity === "error").length;
  const warnings = result.issues.filter((issue) => issue.severity === "warning").length;
  const status = blockedConsumerLanguage || blocking > 0 ? "Needs repair" : warnings > 0 || sourceCount < 3 ? "Warning" : "Pass";
  const qualityScore = Math.max(0, 10 - blocking * 1.5 - warnings * 0.5 - (blockedConsumerLanguage ? 2 : 0) - (sourceCount < 3 ? 1 : 0));
  return { result, blockedConsumerLanguage, sourceCount, status, qualityScore };
}

export default function AdminQA() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminReportRow[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!user?.id) return;
      setLoading(true);
      try {
        const { data: adminRole } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
        if (!mounted) return;
        setIsAdmin(Boolean(adminRole));
        const { data, error } = await supabase
          .from("reports")
          .select("id,title,industry,user_id,is_public,created_at,inputs,output")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        if (mounted) setRows((data ?? []) as unknown as AdminReportRow[]);
      } catch (error) {
        console.error(error);
        toast.error("Could not load the monitoring console.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [user?.id]);

  const summary = useMemo(() => {
    const scored = rows.map(scoreReport);
    return {
      total: rows.length,
      pass: scored.filter((x) => x.status === "Pass").length,
      warning: scored.filter((x) => x.status === "Warning").length,
      repair: scored.filter((x) => x.status === "Needs repair").length,
    };
  }, [rows]);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading monitoring console…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <Card className="max-w-md">
          <CardHeader><CardTitle className="flex items-center justify-center gap-2"><ShieldAlert className="h-5 w-5 text-warning" /> Admin access required</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>This monitoring view is available only to system owners. Consumer reports remain separate from internal monitoring details.</p>
            <Button asChild><Link to="/dashboard">Back to dashboard</Link></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15"><BarChart3 className="h-4 w-4 text-primary" /></span><span className="font-medium">Concept AI</span></Link>
          <div className="flex items-center gap-2"><ThemeToggle /><UserMenu /></div>
        </div>
      </nav>
      <main id="main-content" className="container mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-primary">System-owner monitoring</div>
            <h1 className="mt-1 font-display text-3xl font-bold">Report monitoring console</h1>
            <p className="mt-1 text-sm text-muted-foreground">Internal diagnostics stay here and never appear in consumer reports.</p>
          </div>
          <Badge className="gap-2 bg-primary text-primary-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Admin</Badge>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Total reports</div><div className="font-display text-2xl font-bold">{summary.total}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Pass</div><div className="font-display text-2xl font-bold text-success">{summary.pass}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Warning</div><div className="font-display text-2xl font-bold text-warning">{summary.warning}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Needs repair</div><div className="font-display text-2xl font-bold text-destructive">{summary.repair}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Latest reports</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Report</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Sources</th>
                  <th className="py-2 pr-3">Issues</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const scored = scoreReport(row);
                  return (
                    <tr key={row.id} className="border-b align-top">
                      <td className="max-w-xs py-3 pr-3"><div className="font-medium">{row.title}</div><div className="text-xs text-muted-foreground">{row.industry || "No industry"}</div></td>
                      <td className="py-3 pr-3">{scored.result.template.label}</td>
                      <td className="py-3 pr-3">{scored.qualityScore.toFixed(1)} / 10</td>
                      <td className="py-3 pr-3"><Badge className={statusTone(scored.status)}>{scored.status}</Badge></td>
                      <td className="py-3 pr-3">{scored.sourceCount}</td>
                      <td className="max-w-md py-3 pr-3">
                        {scored.blockedConsumerLanguage && <div className="mb-1 text-xs text-destructive">Consumer-safe wording check failed.</div>}
                        {scored.result.issues.slice(0, 3).map((issue, i) => <div key={`${row.id}-${i}`} className="text-xs text-muted-foreground">{issue.field}: {issue.message}</div>)}
                        {!scored.blockedConsumerLanguage && scored.result.issues.length === 0 && <span className="text-xs text-muted-foreground">No issues detected.</span>}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
