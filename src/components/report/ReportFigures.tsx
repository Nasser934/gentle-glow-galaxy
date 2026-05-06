import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { FeasibilityReport } from "@/types/analysis";
import { sanitizeConsumerText } from "@/lib/consumerSafety";
import type { DiagramRow } from "@/lib/reportPresentation";

const text = (value: unknown) => sanitizeConsumerText(value);

export function MarketFunnelFigure({ report }: { report: FeasibilityReport }) {
  const rows = [
    { label: "TAM", value: report.market.tamValue, sub: report.market.tamLabel, width: 100 },
    { label: "SAM", value: report.market.samValue, sub: report.market.samLabel, width: 72 },
    { label: "SOM", value: report.market.somValue, sub: report.market.somLabel, width: 46 },
  ];
  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">TAM / SAM / SOM Funnel</CardTitle></CardHeader>
    <CardContent className="space-y-5 p-4 sm:p-6">
      {rows.map((row) => <div key={row.label} className="space-y-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <b className="text-sm">{row.label}</b>
          <span className="break-words text-lg font-bold text-primary">{text(row.value)}</span>
        </div>
        <div className="h-auto min-h-11 rounded-xl bg-muted p-1">
          <div className="flex min-h-9 max-w-full items-center rounded-lg bg-primary/85 px-3 py-2 text-[11px] font-semibold leading-4 text-primary-foreground" style={{ width: `${Math.min(100, Math.max(28, row.width))}%` }}>
            <span className="line-clamp-2 break-words">{text(row.sub)}</span>
          </div>
        </div>
      </div>)}
    </CardContent>
  </Card>;
}

export function FMARTFigure({ report }: { report: FeasibilityReport }) {
  const scores = [
    ["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievable", report.scores.achievability],
    ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational],
  ] as const;
  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">FMART Score Figure</CardTitle></CardHeader>
    <CardContent className="space-y-4 p-4 sm:p-6">
      {scores.map(([label, value]) => <div key={label}>
        <div className="mb-1 flex justify-between gap-3 text-xs"><span>{label}</span><b className="shrink-0">{Number(value || 0).toFixed(1)} / 10</b></div>
        <Progress value={Number(value || 0) * 10} className="h-2" />
      </div>)}
    </CardContent>
  </Card>;
}

export function WorkflowFigure({ rows }: { rows: DiagramRow[] }) {
  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">Workflow Diagram</CardTitle></CardHeader>
    <CardContent className="p-4 sm:p-6">
      <div className="grid gap-3 xl:grid-cols-5">
        {rows.map((row, index) => <div key={`${row.step}-${row.activity}`} className="relative min-w-0 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{row.step}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input</div>
          <p className="mt-1 break-words text-xs leading-5">{text(row.input)}</p>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-primary">Activity</div>
          <p className="mt-1 break-words text-sm font-semibold leading-5">{text(row.activity)}</p>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Output</div>
          <p className="mt-1 break-words text-xs leading-5">{text(row.output)}</p>
          {index < rows.length - 1 && <ArrowRight className="absolute -right-4 top-1/2 hidden h-5 w-5 text-muted-foreground xl:block" />}
        </div>)}
      </div>
    </CardContent>
  </Card>;
}

export function RiskMatrixFigure({ report }: { report: FeasibilityReport }) {
  const risks = report.risks.slice(0, 6);
  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">Risk Heatmap Figure</CardTitle></CardHeader>
    <CardContent className="p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-2">
        {["High", "Med", "Low"].map((impact) => ["Low", "Med", "High"].map((prob) => {
          const found = risks.find((r) => r.impact === impact && r.probability === prob);
          return <div key={`${impact}-${prob}`} className="min-h-24 min-w-0 rounded-lg border border-border bg-muted/40 p-2 text-xs">
            <div className="mb-1 break-words text-[9px] uppercase leading-3 text-muted-foreground">P {prob} · I {impact}</div>
            {found ? <b className="block break-words text-[11px] leading-4">{text(found.name)}</b> : <span className="text-muted-foreground">—</span>}
          </div>;
        }))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>Lower probability</span><span>Higher probability</span></div>
    </CardContent>
  </Card>;
}

export function UnitEconomicsFigure({ report }: { report: FeasibilityReport }) {
  return <Card className="overflow-hidden">
    <CardHeader className="pb-2"><CardTitle className="text-base">Unit Economics Figure</CardTitle></CardHeader>
    <CardContent className="grid gap-3 p-4 sm:p-6 md:grid-cols-3">
      <div className="min-w-0 rounded-xl border border-border p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investment</div><b className="mt-2 block break-words text-lg leading-6">{text(report.financials.investmentRange)}</b></div>
      <div className="min-w-0 rounded-xl border border-border p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Break-even</div><b className="mt-2 block break-words text-base leading-6">{text(report.financials.breakEvenSummary)}</b></div>
      <div className="min-w-0 rounded-xl border border-border p-4"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">LTV:CAC</div><b className="mt-2 block break-words text-lg leading-6">{text(report.financials.ltvCacRatio ?? "Requires validation")}</b></div>
    </CardContent>
  </Card>;
}
