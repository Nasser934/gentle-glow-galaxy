import { Activity, AlertTriangle, BarChart3, CheckCircle2, DollarSign, FileText, Globe2, Route, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sourceQuality, validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerSafeEvidenceNote, consumerValidationNote, sanitizeConsumerItems, sanitizeConsumerText } from "@/lib/consumerSafety";
import { buildArchitectureRows, buildConceptNarrative, buildHeadSummary, buildValidationPlan, buildWorkflowRows, effectiveAnalysisConfidence, evidenceRows, presentationReportLabel } from "@/lib/reportPresentation";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

const verdictTone = (value: string) => {
  const v = value.toLowerCase();
  if (v === "proceed") return "bg-success text-success-foreground";
  if (v.includes("conditional") || v.includes("validate")) return "bg-warning text-warning-foreground";
  return "bg-destructive text-destructive-foreground";
};

const riskTone = (level: string) =>
  level === "Low" ? "bg-success/10 text-success border-success/20"
  : level === "Med" ? "bg-warning/10 text-warning border-warning/20"
  : "bg-destructive/10 text-destructive border-destructive/20";

const qualityTone = (quality: string) =>
  quality === "Primary" ? "bg-success/10 text-success border-success/20"
  : quality === "Expert" ? "bg-primary/10 text-primary border-primary/20"
  : quality === "Market" ? "bg-warning/10 text-warning border-warning/20"
  : "bg-muted text-muted-foreground";

const Kpi = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Card>
    <CardContent className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-bold text-foreground">{sanitizeConsumerText(value)}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sanitizeConsumerText(sub)}</div>}
    </CardContent>
  </Card>
);

const ScoreRow = ({ label, score, finding }: { label: string; score: number; finding: string }) => (
  <div className="rounded-lg border border-border p-4">
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-semibold text-foreground">{label}</span>
      <span className="font-bold text-primary">{Number(score || 0).toFixed(1)} / 10</span>
    </div>
    <Progress value={Number(score || 0) * 10} className="mt-2 h-2" />
    <p className="mt-2 text-xs leading-5 text-muted-foreground">{sanitizeConsumerText(finding)}</p>
  </div>
);

const SimpleTable = ({ head, rows }: { head: string[]; rows: string[][] }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[720px] text-sm">
      <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i} className="border-b last:border-0">{row.map((cell, j) => <td key={`${i}-${j}`} className="px-3 py-3 align-top leading-6">{sanitizeConsumerText(cell)}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

export function ConsumerReportDashboard({ report, inputs }: { report: FeasibilityReport; inputs: ConceptInputs }) {
  const validation = validateTemplateIntegrity(inputs, report);
  const recommendation = sanitizeConsumerText(validation.recommendation);
  const templateLabel = sanitizeConsumerText(presentationReportLabel(inputs, report));
  const citations = report.research?.citations ?? [];
  const confidence = effectiveAnalysisConfidence(report);
  const evidenceNote = consumerSafeEvidenceNote(citations.length, confidence.label);
  const scores = report.scores;
  const headSummary = buildHeadSummary(inputs, report);
  const conceptNarrative = buildConceptNarrative(inputs, report);
  const workflowRows = buildWorkflowRows(inputs, report);
  const architectureRows = buildArchitectureRows(inputs, report);
  const validationPlan = buildValidationPlan(inputs, report);
  const evidence = evidenceRows(report);
  const roadmap = report.implementationRoadmap?.phases ?? [];
  const recommendations = sanitizeConsumerItems(report.recommendations, 10);
  const nextSteps = sanitizeConsumerItems(report.nextSteps, 10);

  const scoreRows = [
    ["Financial", scores.financial, scores.financialFinding],
    ["Market", scores.market, scores.marketFinding],
    ["Achievability", scores.achievability, scores.achievabilityFinding],
    ["Risk", scores.risk, scores.riskFinding],
    ["Timing", scores.timing, scores.timingFinding],
    ["Operational", scores.operational, scores.operationalFinding],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> {templateLabel}
          </div>
          <h1 className="max-w-4xl font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">{sanitizeConsumerText(inputs.projectName || "Feasibility Study")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{sanitizeConsumerText(inputs.industry || "Business concept")}{inputs.location ? ` · ${sanitizeConsumerText(inputs.location)}` : ""}</p>
          <p className="mt-5 max-w-4xl text-sm leading-7 text-foreground md:text-base">{sanitizeConsumerText(report.executiveSummary)}</p>
        </div>
        <Card className="border-primary/20 bg-card/80">
          <CardContent className="space-y-3 p-5">
            <Badge className={`w-full justify-center px-4 py-2 text-sm font-bold ${verdictTone(recommendation)}`}>{recommendation}</Badge>
            <Kpi label="Feasibility score" value={`${Number(scores.overall || 0).toFixed(1)} / 10`} sub="FMART weighted" />
            <Kpi label="Analysis confidence" value={confidence.label} sub={confidence.sub} />
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{evidenceNote}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="executive" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5 xl:grid-cols-9">
          <TabsTrigger value="executive" className="gap-2"><FileText className="h-4 w-4" /> Executive</TabsTrigger>
          <TabsTrigger value="score" className="gap-2"><Activity className="h-4 w-4" /> Score</TabsTrigger>
          <TabsTrigger value="market" className="gap-2"><Globe2 className="h-4 w-4" /> Market</TabsTrigger>
          <TabsTrigger value="product" className="gap-2"><BarChart3 className="h-4 w-4" /> Product</TabsTrigger>
          <TabsTrigger value="financial" className="gap-2"><DollarSign className="h-4 w-4" /> Financial</TabsTrigger>
          <TabsTrigger value="risk" className="gap-2"><AlertTriangle className="h-4 w-4" /> Risk</TabsTrigger>
          <TabsTrigger value="research" className="gap-2"><Globe2 className="h-4 w-4" /> Research</TabsTrigger>
          <TabsTrigger value="roadmap" className="gap-2"><Route className="h-4 w-4" /> Roadmap</TabsTrigger>
          <TabsTrigger value="decision" className="gap-2"><Target className="h-4 w-4" /> Decision</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="space-y-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-primary" /> Board-Level Executive Brief</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Kpi label="Feasibility Score" value={`${Number(scores.overall || 0).toFixed(1)} / 10`} sub="FMART weighted" />
                <Kpi label="Recommendation" value={recommendation} sub={templateLabel} />
                <Kpi label="Analysis Confidence" value={confidence.label} sub={confidence.sub} />
                <Kpi label="Next Decision" value={recommendation === "Proceed" ? "Approve controlled scale plan" : "Approve validation gates"} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {headSummary.map((row) => <div key={row.label} className="rounded-lg border border-border p-4"><div className="text-xs font-bold uppercase tracking-wider text-primary">{row.label}</div><p className="mt-2 text-sm leading-6 text-foreground">{sanitizeConsumerText(row.value)}</p></div>)}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="score" className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{scoreRows.map(([label, scoreValue, finding]) => <ScoreRow key={label} label={label} score={scoreValue} finding={finding} />)}</div></TabsContent>

        <TabsContent value="market" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3"><Kpi label="TAM" value={report.market.tamValue} sub={`${report.market.tamLabel} · CAGR ${report.market.tamCagr}`} /><Kpi label="SAM" value={report.market.samValue} sub={`${report.market.samLabel} · CAGR ${report.market.samCagr}`} /><Kpi label="SOM" value={report.market.somValue} sub={`${report.market.somLabel} · CAGR ${report.market.somCagr}`} /></div>
          <Card><CardHeader><CardTitle className="text-base">Competitive Positioning</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{report.competitors.slice(0, 9).map((c) => <div key={c.name} className="rounded-lg border border-border p-3"><div className="font-semibold text-foreground">{sanitizeConsumerText(c.name)}</div><p className="mt-1 text-xs text-muted-foreground">{sanitizeConsumerText(c.model)}</p><p className="mt-2 text-xs"><span className="font-semibold text-destructive">Gap:</span> {sanitizeConsumerText(c.weakness)}</p><p className="mt-1 text-xs"><span className="font-semibold text-primary">Wedge:</span> {sanitizeConsumerText(c.edge)}</p></div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="product" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Detailed Concept Explanation</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{conceptNarrative.map((p) => <p key={p} className="rounded-lg border border-border p-4 text-sm leading-7 text-foreground">{sanitizeConsumerText(p)}</p>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Product Workflow</CardTitle></CardHeader><CardContent><SimpleTable head={["Step", "Input", "Activity", "Output", "Control"]} rows={workflowRows.map((r) => [r.step, r.input, r.activity, r.output, r.control])} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Architecture View</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{architectureRows.map((r) => <div key={r.label} className="rounded-lg border border-border p-3"><div className="font-semibold text-foreground">{r.label}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{sanitizeConsumerText(r.value)}</p></div>)}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Value Map</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Kpi label="Target customer" value={report.customer.ageLocation} /><Kpi label="Buyer need" value={report.customer.goals} /><Kpi label="Willingness to pay" value={report.customer.willingnessToPay} /><Kpi label="Adoption behavior" value={report.customer.behavior} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3"><Kpi label="Investment range" value={report.financials.investmentRange} sub={report.financials.currency} /><Kpi label="Break-even" value={report.financials.breakEvenSummary} /><Kpi label="LTV:CAC" value={report.financials.ltvCacRatio ?? "Requires validation"} /></div>
          <Card><CardHeader><CardTitle className="text-base">Revenue Scenarios</CardTitle></CardHeader><CardContent><SimpleTable head={["Scenario", "Probability", "Customers", "Revenue", "Break-even"]} rows={report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven])} /></CardContent></Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Risk Register</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{report.risks.slice(0, 10).map((r) => <div key={r.name} className="rounded-lg border border-border p-3"><div className="flex items-start justify-between gap-3"><div className="font-semibold text-foreground">{sanitizeConsumerText(r.name)}</div><Badge variant="outline" className={riskTone(r.level)}>{sanitizeConsumerText(r.level)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Probability {sanitizeConsumerText(r.probability)} · Impact {sanitizeConsumerText(r.impact)}</p><p className="mt-2 text-sm text-foreground">{sanitizeConsumerText(r.mitigation)}</p></div>)}</CardContent></Card></TabsContent>

        <TabsContent value="research" className="space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Evidence and Validation</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm leading-7 text-foreground">{sanitizeConsumerText(report.research?.overview || evidenceNote)}</p><p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">{consumerValidationNote}</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{evidence.map((r) => <div key={`${r.label}-${r.value}`} className="rounded-lg border border-border p-3"><div className="flex items-center justify-between gap-2"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{sanitizeConsumerText(r.label)}</div><Badge variant="outline" className={qualityTone(r.label)}>{sanitizeConsumerText(r.label)}</Badge></div><p className="mt-2 text-sm font-medium text-foreground">{sanitizeConsumerText(r.value)}</p>{r.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{sanitizeConsumerText(r.note)}</p>}</div>)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Validation Plan</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{validationPlan.map((r) => <div key={r.label} className="rounded-lg border border-border p-3"><div className="font-semibold text-foreground">{r.label}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{sanitizeConsumerText(r.value)}</p></div>)}</CardContent></Card>
        </TabsContent>

        <TabsContent value="roadmap" className="space-y-4">
          {roadmap.length > 0 && <Card><CardHeader><CardTitle className="text-base">Phase-Gate Roadmap</CardTitle></CardHeader><CardContent className="space-y-3">{roadmap.map((p, i) => <div key={`${p.phase}-${i}`} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[8rem_1fr]"><div><div className="font-semibold text-primary">{sanitizeConsumerText(p.phase)}</div><div className="text-xs text-muted-foreground">{sanitizeConsumerText(p.timeline)}</div></div><div className="text-sm"><p>{sanitizeConsumerText(p.keyActivities)}</p><p className="mt-1 text-xs text-muted-foreground">Gate: {sanitizeConsumerText(p.decisionGate)} · Metric: {sanitizeConsumerText(p.successMetric)}</p></div></div>)}</CardContent></Card>}
          <Card><CardHeader><CardTitle className="text-base">Next Steps</CardTitle></CardHeader><CardContent><ol className="space-y-2 text-sm">{nextSteps.map((s, i) => <li key={`${s}-${i}`} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span>{s}</span></li>)}</ol></CardContent></Card>
        </TabsContent>

        <TabsContent value="decision" className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Strategic Recommendations</CardTitle></CardHeader><CardContent><ol className="space-y-2 text-sm">{recommendations.map((r, i) => <li key={`${r}-${i}`} className="flex gap-2"><span className="font-bold text-primary">{i + 1}.</span><span>{r}</span></li>)}</ol></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Final Decision</CardTitle></CardHeader><CardContent><p className="text-sm leading-7 text-foreground">Recommendation: <b>{recommendation}</b>. Use the next phase to validate the highest-impact assumptions before committing scale funding.</p></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
