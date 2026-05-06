import { useMemo } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";
import { generateLocalReport } from "@/lib/localReport";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type State = { report?: Partial<FeasibilityReport>; inputs?: ConceptInputs };

const valid = (r?: Partial<FeasibilityReport>): r is FeasibilityReport => Boolean(
  r?.reportId && r?.scores && typeof r.scores.overall === "number" && r.market && r.financials && Array.isArray(r.risks)
);

const money = (v: number) => `USD ${Math.round(v).toLocaleString()}`;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card><CardContent className="p-5"><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 font-display text-xl font-bold text-foreground">{value}</div>{sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}</CardContent></Card>;
}

export default function ResultsRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? {}) as State;
  const inputs = state.inputs;

  const report = useMemo(() => {
    if (!inputs) return null;
    return valid(state.report) ? state.report : generateLocalReport(inputs);
  }, [inputs, state.report]);

  if (!inputs || !report) return <Navigate to="/analyze" replace />;

  const validation = validateTemplateIntegrity(inputs, report);
  const recommendation = validation.recommendation;
  const tone = recommendation === "Proceed" ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground";

  const exportPdf = async () => {
    const { exportReportToPdfV2 } = await import("@/lib/exportPdfV4");
    const root = document.getElementById("recovery-report-root");
    if (!root) return;
    await exportReportToPdfV2(root, `${report.reportId}.pdf`, { report, inputs });
  };

  return <div className="min-h-screen bg-background text-foreground">
    <nav className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-14 items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15"><BarChart3 className="h-4 w-4 text-primary" /></span><span className="font-medium">Concept AI</span></Link>
        <div className="flex items-center gap-2"><ThemeToggle /><Button variant="outline" size="sm" onClick={() => navigate("/analyze")} className="gap-1"><ArrowLeft className="h-4 w-4" />New</Button><Button size="sm" onClick={exportPdf} className="gap-1"><Download className="h-4 w-4" />Export</Button><UserMenu /></div>
      </div>
    </nav>

    <main id="recovery-report-root" className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-3 gap-2"><ShieldCheck className="h-3.5 w-3.5" />{validation.template.label}</Badge>
          <h1 className="font-display text-3xl font-bold">{inputs.projectName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{inputs.industry || "Unspecified industry"}{inputs.location ? ` · ${inputs.location}` : ""} · Report {report.reportId}</p>
        </div>
        <div className={`rounded-full px-4 py-2 text-sm font-bold ${tone}`}>{recommendation}</div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Kpi label="Overall Score" value={`${report.scores.overall.toFixed(1)} / 10`} sub="FMART weighted" />
        <Kpi label="Investment" value={report.financials.investmentRange || money(report.financials.capExTotal.mid)} sub={report.financials.currency} />
        <Kpi label="Market TAM" value={report.market.tamValue} sub={`CAGR ${report.market.tamCagr}`} />
        <Kpi label="Break-even" value={report.financials.breakEvenSummary} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader><CardContent><p className="text-sm leading-7 text-foreground">{report.executiveSummary}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Score Breakdown</CardTitle></CardHeader><CardContent className="space-y-3">{[
          ["Financial", report.scores.financial, report.scores.financialFinding], ["Market", report.scores.market, report.scores.marketFinding], ["Achievable", report.scores.achievability, report.scores.achievabilityFinding], ["Risk", report.scores.risk, report.scores.riskFinding], ["Timing", report.scores.timing, report.scores.timingFinding], ["Operational", report.scores.operational, report.scores.operationalFinding]
        ].map(([name, score, finding]) => <div key={String(name)} className="rounded-md border border-border p-3"><div className="flex justify-between text-sm font-semibold"><span>{name}</span><span className="text-primary">{Number(score).toFixed(1)} / 10</span></div><p className="mt-1 text-xs text-muted-foreground">{String(finding)}</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Top Risks</CardTitle></CardHeader><CardContent className="space-y-2">{report.risks.slice(0, 6).map((r) => <div key={r.name} className="rounded-md border border-border p-3"><div className="flex justify-between gap-3"><b>{r.name}</b><Badge variant="outline">{r.level}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{r.mitigation}</p></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recommendations</CardTitle></CardHeader><CardContent><ol className="space-y-2 text-sm">{report.recommendations.map((x, i) => <li key={x} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span>{x}</span></li>)}</ol></CardContent></Card>
      </div>
    </main>
  </div>;
}
