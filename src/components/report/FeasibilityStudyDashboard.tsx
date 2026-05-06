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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card><CardContent className="p-5"><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-2xl font-bold text-foreground">{sanitizeConsumerText(value)}</div>{sub && <div className="mt-1 text-xs text-muted-foreground">{sanitizeConsumerText(sub)}</div>}</CardContent></Card>;
}

function MiniTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b last:border-0">{row.map((cell, j) => <td key={`${i}-${j}`} className="px-3 py-3 align-top leading-6">{sanitizeConsumerText(cell)}</td>)}</tr>)}</tbody></table></div>;
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

  return <div className="space-y-8">
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <Badge variant="outline" className="mb-3 bg-primary/5 text-primary">{label}</Badge>
        <h1 className="max-w-5xl text-4xl font-bold tracking-tight md:text-5xl">{sanitizeConsumerText(inputs.projectName || "Feasibility Study")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{sanitizeConsumerText(inputs.industry)}{inputs.location ? ` · ${sanitizeConsumerText(inputs.location)}` : ""}</p>
        <p className="mt-6 max-w-4xl text-base leading-8 text-foreground">{sanitizeConsumerText(report.executiveSummary)}</p>
      </div>
      <Card className="border-primary/20"><CardContent className="space-y-3 p-5"><Badge className={`w-full justify-center py-2 ${tone(validation.recommendation)}`}>{validation.recommendation}</Badge><Kpi label="Feasibility Score" value={`${Number(report.scores.overall || 0).toFixed(1)} / 10`} sub="FMART weighted" /><Kpi label="Analysis Confidence" value={confidence.label} sub={confidence.sub} /><div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">{consumerSafeEvidenceNote(citations.length, confidence.label)}</div></CardContent></Card>
    </section>

    <section className="grid gap-4 lg:grid-cols-4">
      <Kpi label="Report Type" value={label} />
      <Kpi label="Recommendation" value={validation.recommendation} />
      <Kpi label="Investment" value={report.financials.investmentRange} sub={report.financials.currency} />
      <Kpi label="LTV:CAC" value={report.financials.ltvCacRatio ?? "Requires validation"} />
    </section>

    <Tabs defaultValue="executive" className="space-y-5">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5 xl:grid-cols-9">
        <TabsTrigger value="executive"><FileText className="mr-2 h-4 w-4" />Executive</TabsTrigger><TabsTrigger value="score"><Activity className="mr-2 h-4 w-4" />Score</TabsTrigger><TabsTrigger value="market"><Globe2 className="mr-2 h-4 w-4" />Market</TabsTrigger><TabsTrigger value="product"><BarChart3 className="mr-2 h-4 w-4" />Product</TabsTrigger><TabsTrigger value="financial"><DollarSign className="mr-2 h-4 w-4" />Financial</TabsTrigger><TabsTrigger value="risk"><AlertTriangle className="mr-2 h-4 w-4" />Risk</TabsTrigger><TabsTrigger value="research"><Globe2 className="mr-2 h-4 w-4" />Research</TabsTrigger><TabsTrigger value="roadmap"><Route className="mr-2 h-4 w-4" />Roadmap</TabsTrigger><TabsTrigger value="decision"><Target className="mr-2 h-4 w-4" />Decision</TabsTrigger>
      </TabsList>

      <TabsContent value="executive" className="space-y-4"><Card><CardHeader><CardTitle>Board-Level Executive Brief</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-2">{headSummary.map((row) => <div key={row.label} className="rounded-xl border p-4"><div className="text-xs font-bold uppercase tracking-wider text-primary">{row.label}</div><p className="mt-2 text-sm leading-6">{sanitizeConsumerText(row.value)}</p></div>)}</CardContent></Card><div className="grid gap-4 lg:grid-cols-2"><FMARTFigure report={report} /><RiskMatrixFigure report={report} /></div></TabsContent>
      <TabsContent value="score"><div className="grid gap-4 lg:grid-cols-2"><FMARTFigure report={report} /><Card><CardHeader><CardTitle>Score Drivers</CardTitle></CardHeader><CardContent><MiniTable head={["Dimension","Score","Finding"]} rows={[["Financial", Number(report.scores.financial || 0).toFixed(1), report.scores.financialFinding],["Market", Number(report.scores.market || 0).toFixed(1), report.scores.marketFinding],["Achievability", Number(report.scores.achievability || 0).toFixed(1), report.scores.achievabilityFinding],["Risk", Number(report.scores.risk || 0).toFixed(1), report.scores.riskFinding],["Timing", Number(report.scores.timing || 0).toFixed(1), report.scores.timingFinding],["Operational", Number(report.scores.operational || 0).toFixed(1), report.scores.operationalFinding]]} /></CardContent></Card></div></TabsContent>
      <TabsContent value="market" className="space-y-4"><MarketFunnelFigure report={report} /><Card><CardHeader><CardTitle>Competitive Positioning</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{report.competitors.map((c) => <div key={c.name} className="rounded-xl border p-4"><b>{sanitizeConsumerText(c.name)}</b><p className="mt-1 text-xs text-muted-foreground">{sanitizeConsumerText(c.model)}</p><p className="mt-2 text-sm"><b className="text-destructive">Gap:</b> {sanitizeConsumerText(c.weakness)}</p><p className="mt-1 text-sm"><b className="text-primary">Wedge:</b> {sanitizeConsumerText(c.edge)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="product" className="space-y-4"><Card><CardHeader><CardTitle>Detailed Concept Explanation</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{concept.map((p) => <p key={p} className="rounded-xl border p-4 text-sm leading-7">{sanitizeConsumerText(p)}</p>)}</CardContent></Card><WorkflowFigure rows={workflow} /><Card><CardHeader><CardTitle>Architecture Figure</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{architecture.map((r) => <div key={r.label} className="rounded-xl border p-4"><b>{sanitizeConsumerText(r.label)}</b><p className="mt-2 text-sm leading-6 text-muted-foreground">{sanitizeConsumerText(r.value)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="financial" className="space-y-4"><UnitEconomicsFigure report={report} /><Card><CardHeader><CardTitle>Revenue Scenarios</CardTitle></CardHeader><CardContent><MiniTable head={["Scenario","Probability","Customers","Revenue","Break-even"]} rows={report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven])} /></CardContent></Card></TabsContent>
      <TabsContent value="risk"><div className="grid gap-4 lg:grid-cols-2"><RiskMatrixFigure report={report} /><Card><CardHeader><CardTitle>Risk Register</CardTitle></CardHeader><CardContent className="grid gap-3">{report.risks.map((r) => <div key={r.name} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><b>{sanitizeConsumerText(r.name)}</b><Badge variant="outline">{r.level}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Probability {r.probability} · Impact {r.impact}</p><p className="mt-2 text-sm">{sanitizeConsumerText(r.mitigation)}</p></div>)}</CardContent></Card></div></TabsContent>
      <TabsContent value="research" className="space-y-4"><Card><CardHeader><CardTitle>Evidence and Validation</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{evidence.map((r) => <div key={`${r.label}-${r.value}`} className="rounded-xl border p-4"><Badge variant="outline">{sanitizeConsumerText(r.label)}</Badge><p className="mt-2 text-sm font-medium">{sanitizeConsumerText(r.value)}</p>{r.note && <p className="mt-1 text-xs text-muted-foreground">{sanitizeConsumerText(r.note)}</p>}</div>)}</CardContent></Card><Card><CardHeader><CardTitle>Validation Plan</CardTitle></CardHeader><CardContent className="grid gap-3 lg:grid-cols-3">{validationPlan.map((r) => <div key={r.label} className="rounded-xl border p-4"><b>{sanitizeConsumerText(r.label)}</b><p className="mt-2 text-sm leading-6 text-muted-foreground">{sanitizeConsumerText(r.value)}</p></div>)}</CardContent></Card></TabsContent>
      <TabsContent value="roadmap"><Card><CardHeader><CardTitle>Phase-Gate Roadmap</CardTitle></CardHeader><CardContent className="grid gap-3">{roadmap.length ? roadmap.map((p) => <div key={p.phase} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[10rem_1fr]"><div><b>{sanitizeConsumerText(p.phase)}</b><p className="text-xs text-muted-foreground">{sanitizeConsumerText(p.timeline)}</p></div><div><p>{sanitizeConsumerText(p.keyActivities)}</p><p className="mt-1 text-xs text-muted-foreground">Gate: {sanitizeConsumerText(p.decisionGate)} · Metric: {sanitizeConsumerText(p.successMetric)}</p></div></div>) : nextSteps.map((s, i) => <p key={s}>{i + 1}. {s}</p>)}</CardContent></Card></TabsContent>
      <TabsContent value="decision" className="space-y-4"><Card><CardHeader><CardTitle>Strategic Recommendations</CardTitle></CardHeader><CardContent><ol className="space-y-3">{recommendations.map((r, i) => <li key={r} className="flex gap-3"><b className="text-primary">{i + 1}.</b><span>{r}</span></li>)}</ol></CardContent></Card><Card><CardHeader><CardTitle>Final Decision</CardTitle></CardHeader><CardContent><p>Recommendation: <b>{validation.recommendation}</b>. Use the next phase to validate the highest-impact assumptions before committing scale funding.</p></CardContent></Card></TabsContent>
    </Tabs>
  </div>;
}
