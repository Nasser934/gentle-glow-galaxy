import { FileText, Activity, Globe2, BarChart3, DollarSign, AlertTriangle, Route, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerSafeEvidenceNote, sanitizeConsumerItems, sanitizeConsumerText } from "@/lib/consumerSafety";
import { buildArchitectureRows, buildConceptNarrative, buildHeadSummary, buildValidationPlan, buildWorkflowRows, effectiveAnalysisConfidence, evidenceRows, presentationReportLabel } from "@/lib/reportPresentation";
import { FMARTFigure, MarketFunnelFigure, RiskMatrixFigure, UnitEconomicsFigure, WorkflowFigure } from "./ReportFigures";

const tone = (value: string) => value === "Proceed" ? "bg-success text-success-foreground" : value.includes("Conditional") ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
const clean = (value: unknown) => sanitizeConsumerText(value);

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="min-w-0 overflow-hidden">
    <CardContent className="p-4 sm:p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xl font-bold leading-7 text-foreground sm:text-2xl">{clean(value)}</div>
      {sub && <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{clean(sub)}</div>}
    </CardContent>
  </Card>;
}

function MiniTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className="space-y-3">
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
      <table className="w-full table-fixed text-sm">
        <thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-b last:border-0">{row.map((cell, j) => <td key={`${i}-${j}`} className="break-words px-3 py-3 align-top leading-6">{clean(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 md:hidden">
      {rows.map((row, i) => <div key={i} className="rounded-lg border border-border p-3">
        {row.map((cell, j) => <div key={`${i}-${j}`} className="py-1 first:pt-0 last:pb-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{head[j]}</div>
          <div className="break-words text-sm leading-6 text-foreground">{clean(cell)}</div>
        </div>)}
      </div>)}
    </div>
  </div>;
}

export function FeasibilityStudyDashboard({ report, inputs }: { report: FeasibilityReport; inputs: ConceptInputs }) {
  const validation = validateTemplateIntegrity(inputs, report);
  const confidence = effectiveAnalysisConfidence(report);
  const label = presentationReportLabel(inputs, report);
  const citations = report.research?.citations ?? [];
  const workflow = buildWorkflowRows(inputs, report);
  const architecture = buildArchitectureRows(inputs, report);
  const headSummary = buildHeadSummary(inputs, report);
  const concept = buildConceptNarrative(inputs, report);
  const evidence = evidenceRows(report);
  const validationPlan = buildValidationPlan(inputs, report);
  const roadmap = report.implementationRoadmap?.phases ?? [];
  const nextSteps = sanitizeConsumerItems(report.nextSteps, 8);
  const recommendations = sanitizeConsumerItems(report.recommendations, 8);

  return <div className="mx-auto w-full max-w-6xl space-y-6 overflow-hidden sm:space-y-8">
    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <Badge variant="outline" className="mb-3 max-w-full break-words bg-primary/5 text-primary">{clean(label)}</Badge>
        <h1 className="max-w-4xl break-words text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">{clean(inputs.projectName || "Feasibility Study")}</h1>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{clean(inputs.industry)}{inputs.location ? ` · ${clean(inputs.location)}` : ""}</p>
        <p className="mt-5 max-w-3xl break-words text-sm leading-7 text-foreground sm:text-base sm:leading-8">{clean(report.executiveSummary)}</p>
      </div>
      <Card className="min-w-0 overflow-hidden border-primary/20">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <Badge className={`w-full justify-center py-2 ${tone(validation.recommendation)}`}>{clean(validation.recommendation)}</Badge>
          <Kpi label="Feasibility Score" value={`${Number(report.scores.overall || 0).toFixed(1)} / 10`} sub="FMART weighted" />
          <Kpi label="Analysis Confidence" value={confidence.label} sub={confidence.sub} />
          <div className="break-words rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{consumerSafeEvidenceNote(citations.length, confidence.label)}</div>
        </CardContent>
      </Card>
    </section>

    <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Report Type" value={label} />
      <Kpi label="Recommendation" value={validation.recommendation} />
      <Kpi label="Investment" value={report.financials.investmentRange} sub={report.financials.currency} />
      <Kpi label="LTV:CAC" value={report.financials.ltvCacRatio ?? "Requires validation"} />
    </section>

    <Tabs defaultValue="executive" className="min-w-0 space-y-5">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 text-xs sm:grid-cols-3 lg:grid-cols-7">
        <TabsTrigger value="executive" className="gap-1"><FileText className="h-4 w-4" />Executive</TabsTrigger>
        <TabsTrigger value="score" className="gap-1"><Activity className="h-4 w-4" />Score</TabsTrigger>
        <TabsTrigger value="market" className="gap-1"><Globe2 className="h-4 w-4" />Market</TabsTrigger>
        <TabsTrigger value="product" className="gap-1"><BarChart3 className="h-4 w-4" />Product</TabsTrigger>
        <TabsTrigger value="financial" className="gap-1"><DollarSign className="h-4 w-4" />Financial</TabsTrigger>
        <TabsTrigger value="risk" className="gap-1"><AlertTriangle className="h-4 w-4" />Risk</TabsTrigger>
        <TabsTrigger value="research" className="gap-1"><Globe2 className="h-4 w-4" />Research</TabsTrigger>
        <TabsTrigger value="roadmap" className="gap-1"><Route className="h-4 w-4" />Roadmap</TabsTrigger>
        <TabsTrigger value="decision" className="gap-1"><Target className="h-4 w-4" />Decision</TabsTrigger>
      </TabsList>

      <TabsContent value="executive" className="space-y-4"><Card className="overflow-hidden"><CardHeader><CardTitle>Board-Level Executive Brief</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{headSummary.map((row) => <div key={row.label} className="min-w-0 rounded-xl border p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-primary">{clean(row.label)}</div><p className="mt-2 break-words text-sm leading-6">{clean(row.value)}</p></div>)}</CardContent></Card><div className="grid gap-4 lg:grid-cols-2"><FMARTFigure report={report} /><RiskMatrixFigure report={report} /></div></TabsContent>
      <TabsContent value="score"><div className="grid gap-4 lg:grid-cols-2"><FMARTFigure report={report} /><Card className="overflow-hidden"><CardHeader><CardTitle>Score Drivers</CardTitle></CardHeader><CardContent><MiniTable head={["Dimension","Score","Finding"]} rows={[["Financial", Number(report.scores.financial || 0).toFixed(1), report.scores.financialFinding],["Market", Number(report.scores.market || 0).toFixed(1), report.scores.marketFinding],["Achievability", Number(report.scores.achievability || 0).toFixed(1), report.scores.achievabilityFinding],["Risk", Number(report.scores.risk || 0).toFixed(1), report.scores.riskFinding],["Timing", Number(report.scores.timing || 0).toFixed(1), report.scores.timingFinding],["Operational", Number(report.scores.operational || 0).toFixed(1), report.scores.operationalFinding]]} /></CardContent></Card></div></TabsContent>
      <TabsContent value="market" className="space-y-4"><MarketFunnelFigure report={report} /><Card className="overflow-hidden"><CardHeader><CardTitle>Competitive Positioning</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{report.competitors.map((c) => <div key={c.name} className="min-w-0 rounded-xl border p-4"><b className="break-words">{clean(c.name)}</b><p className="mt-1 break-words text-xs text-muted-foreground">{clean(c.model)}</p><p className="mt-2 break-words text-sm"><b className="text-destructive">Gap:</b> {clean(c.weakness)}</p><p className="mt-1 break-words text-sm"><b className="text-primary">Wedge:</b> {clean(c.edge)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="product" className="space-y-4"><Card className="overflow-hidden"><CardHeader><CardTitle>Detailed Concept Explanation</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{concept.map((p) => <p key={p} className="min-w-0 break-words rounded-xl border p-4 text-sm leading-7">{clean(p)}</p>)}</CardContent></Card><WorkflowFigure rows={workflow} /><Card className="overflow-hidden"><CardHeader><CardTitle>Architecture Figure</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{architecture.map((r) => <div key={r.label} className="min-w-0 rounded-xl border p-4"><b className="break-words">{clean(r.label)}</b><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{clean(r.value)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="financial" className="space-y-4"><UnitEconomicsFigure report={report} /><Card className="overflow-hidden"><CardHeader><CardTitle>Revenue Scenarios</CardTitle></CardHeader><CardContent><MiniTable head={["Scenario","Probability","Customers","Revenue","Break-even"]} rows={report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven])} /></CardContent></Card></TabsContent>
      <TabsContent value="risk"><div className="grid gap-4 lg:grid-cols-2"><RiskMatrixFigure report={report} /><Card className="overflow-hidden"><CardHeader><CardTitle>Risk Register</CardTitle></CardHeader><CardContent className="grid gap-3">{report.risks.map((r) => <div key={r.name} className="min-w-0 rounded-xl border p-4"><div className="flex justify-between gap-2"><b className="break-words">{clean(r.name)}</b><Badge variant="outline" className="shrink-0">{clean(r.level)}</Badge></div><p className="mt-1 break-words text-xs text-muted-foreground">Probability {clean(r.probability)} · Impact {clean(r.impact)}</p><p className="mt-2 break-words text-sm">{clean(r.mitigation)}</p></div>)}</CardContent></Card></div></TabsContent>
      <TabsContent value="research" className="space-y-4"><Card className="overflow-hidden"><CardHeader><CardTitle>Evidence and Validation</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{evidence.map((r) => <div key={`${r.label}-${r.value}`} className="min-w-0 rounded-xl border p-4"><Badge variant="outline" className="max-w-full break-words">{clean(r.label)}</Badge><p className="mt-2 break-words text-sm font-medium">{clean(r.value)}</p>{r.note && <p className="mt-1 break-words text-xs text-muted-foreground">{clean(r.note)}</p>}</div>)}</CardContent></Card><Card className="overflow-hidden"><CardHeader><CardTitle>Validation Plan</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{validationPlan.map((r) => <div key={r.label} className="min-w-0 rounded-xl border p-4"><b className="break-words">{clean(r.label)}</b><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{clean(r.value)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="roadmap"><Card className="overflow-hidden"><CardHeader><CardTitle>Phase-Gate Roadmap</CardTitle></CardHeader><CardContent className="grid gap-3">{roadmap.length ? roadmap.map((p) => <div key={p.phase} className="grid min-w-0 gap-3 rounded-xl border p-4 md:grid-cols-[10rem_1fr]"><div><b className="break-words">{clean(p.phase)}</b><p className="break-words text-xs text-muted-foreground">{clean(p.timeline)}</p></div><div><p className="break-words">{clean(p.keyActivities)}</p><p className="mt-1 break-words text-xs text-muted-foreground">Gate: {clean(p.decisionGate)} · Metric: {clean(p.successMetric)}</p></div></div>) : nextSteps.map((s, i) => <p key={s} className="break-words">{i + 1}. {s}</p>)}</CardContent></Card></TabsContent>
      <TabsContent value="decision" className="space-y-4"><Card className="overflow-hidden"><CardHeader><CardTitle>Strategic Recommendations</CardTitle></CardHeader><CardContent><ol className="space-y-3">{recommendations.map((r, i) => <li key={r} className="flex gap-3"><b className="shrink-0 text-primary">{i + 1}.</b><span className="break-words">{r}</span></li>)}</ol></CardContent></Card><Card className="overflow-hidden"><CardHeader><CardTitle>Final Decision</CardTitle></CardHeader><CardContent><p className="break-words leading-7">Recommendation: <b>{clean(validation.recommendation)}</b>. Use the next phase to validate the highest-impact assumptions before committing scale funding.</p></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
