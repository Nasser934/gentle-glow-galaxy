import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FeasibilityReport } from "@/types/analysis";
import { sanitizeConsumerText } from "@/lib/consumerSafety";
import type { DiagramRow } from "@/lib/reportPresentation";

export function MarketFunnelFigure({ report }: { report: FeasibilityReport }) {
  const rows = [
    { label: "TAM", value: report.market.tamValue, sub: report.market.tamLabel, width: 100 },
    { label: "SAM", value: report.market.samValue, sub: report.market.samLabel, width: 72 },
    { label: "SOM", value: report.market.somValue, sub: report.market.somLabel, width: 46 },
  ];
  return <Card>
    <CardHeader><CardTitle className="text-base">TAM / SAM / SOM Funnel</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {rows.map((row) => <div key={row.label}>
        <div className="mb-1 flex items-center justify-between text-sm"><b>{row.label}</b><span>{sanitizeConsumerText(row.value)}</span></div>
        <div className="h-9 rounded-xl bg-muted"><div className="flex h-9 items-center rounded-xl bg-primary/80 px-3 text-xs font-semibold text-primary-foreground" style={{ width: `${row.width}%` }}>{sanitizeConsumerText(row.sub)}</div></div>
      </div>)}
    </CardContent>
  </Card>;
}

export function FMARTFigure({ report }: { report: FeasibilityReport }) {
  const scores = [
    ["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievable", report.scores.achievability],
    ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational],
  ] as const;
  return <Card>
    <CardHeader><CardTitle className="text-base">FMART Score Figure</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {scores.map(([label, value]) => <div key={label}>
        <div className="mb-1 flex justify-between text-xs"><span>{label}</span><b>{Number(value).toFixed(1)} / 10</b></div>
        <Progress value={Number(value) * 10} className="h-2" />
      </div>)}
    </CardContent>
  </Card>;
}

export function WorkflowFigure({ rows }: { rows: DiagramRow[] }) {
  return <Card>
    <CardHeader><CardTitle className="text-base">Workflow Diagram</CardTitle></CardHeader>
    <CardContent>
      <div className="grid gap-3 xl:grid-cols-5">
        {rows.map((row, index) => <div key={`${row.step}-${row.activity}`} className="relative rounded-xl border border-border bg-card p-3">
          <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{row.step}</div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input</div>
          <p className="mt-1 text-xs leading-5">{sanitizeConsumerText(row.input)}</p>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-primary">Activity</div>
          <p className="mt-1 text-sm font-medium leading-5">{sanitizeConsumerText(row.activity)}</p>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</div>
          <p className="mt-1 text-xs leading-5">{sanitizeConsumerText(row.output)}</p>
          {index < rows.length - 1 && <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 text-muted-foreground xl:block" />}
        </div>)}
      </div>
    </CardContent>
  </Card>;
}

export function RiskMatrixFigure({ report }: { report: FeasibilityReport }) {
  const risks = report.risks.slice(0, 6);
  return <Card>
    <CardHeader><CardTitle className="text-base">Risk Heatmap Figure</CardTitle></CardHeader>
    <CardContent>
      <div className="grid grid-cols-3 gap-2">
        {["Low", "Med", "High"].reverse().map((impact) => ["Low", "Med", "High"].map((prob) => {
          const found = risks.find((r) => r.impact === impact && r.probability === prob);
          return <div key={`${impact}-${prob}`} className="min-h-24 rounded-lg border border-border bg-muted/40 p-2 text-xs">
            <div className="mb-1 text-[10px] uppercase text-muted-foreground">P {prob} · I {impact}</div>
            {found ? <b>{sanitizeConsumerText(found.name)}</b> : <span className="text-muted-foreground">—</span>}
          </div>;
        }))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Lower probability</span><span>Higher probability</span></div>
    </CardContent>
  </Card>;
}

export function UnitEconomicsFigure({ report }: { report: FeasibilityReport }) {
  return <Card>
    <CardHeader><CardTitle className="text-base">Unit Economics Figure</CardTitle></CardHeader>
    <CardContent className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-border p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Investment</div><b className="mt-2 block text-lg">{sanitizeConsumerText(report.financials.investmentRange)}</b></div>
      <div className="rounded-xl border border-border p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">Break-even</div><b className="mt-2 block text-lg">{sanitizeConsumerText(report.financials.breakEvenSummary)}</b></div>
      <div className="rounded-xl border border-border p-4"><div className="text-xs uppercase tracking-wider text-muted-foreground">LTV:CAC</div><b className="mt-2 block text-lg">{sanitizeConsumerText(report.financials.ltvCacRatio ?? "Requires validation")}</b></div>
    </CardContent>
  </Card>;
}
