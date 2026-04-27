import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, DollarSign, Target, AlertTriangle, Clock, Users } from "lucide-react";
import { FMARTRadar } from "./FMARTRadar";
import { MarketGrowthChart } from "./MarketGrowthChart";
import { CapExBarChart } from "./CapExBarChart";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

const verdictTone = (v: string) =>
  v === "PROCEED" ? "bg-emerald-500 text-white"
  : v === "PROCEED WITH CAUTION" ? "bg-amber-500 text-white"
  : v === "REVISE" ? "bg-orange-500 text-white"
  : "bg-rose-600 text-white";

const Kpi = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="truncate font-display text-lg font-bold text-foreground">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export const InteractiveDashboard = ({
  report, inputs,
}: { report: FeasibilityReport; inputs: ConceptInputs }) => {
  const cur = report.financials.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">{inputs.projectName} — Live Dashboard</h2>
          <p className="text-sm text-muted-foreground">Interactive overview · scroll down for the printable report.</p>
        </div>
        <Badge className={`px-3 py-1.5 text-sm font-bold ${verdictTone(report.scores.verdict)}`}>
          {report.scores.verdict}
        </Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Target}    label="Overall Score"  value={`${report.scores.overall.toFixed(1)} / 10`} sub="FMART weighted" />
        <Kpi icon={DollarSign} label="Investment"     value={report.financials.investmentRange} sub={cur} />
        <Kpi icon={Clock}     label="Break-Even"     value={report.financials.breakEvenSummary} />
        <Kpi icon={TrendingUp} label="Market (TAM)"   value={report.market.tamValue} sub={`CAGR ${report.market.tamCagr}`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">FMART Score Radar</CardTitle></CardHeader>
          <CardContent><FMARTRadar scores={report.scores} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Market Growth — TAM vs SAM</CardTitle></CardHeader>
          <CardContent><MarketGrowthChart data={report.market.growthChart} currency={report.market.currency} /></CardContent>
        </Card>
      </div>

      {/* Score bars */}
      <Card>
        <CardHeader><CardTitle className="text-base">Dimension breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            ["Financial",     report.scores.financial,     report.scores.financialFinding],
            ["Market",        report.scores.market,        report.scores.marketFinding],
            ["Achievability", report.scores.achievability, report.scores.achievabilityFinding],
            ["Operational",   report.scores.operational,   report.scores.operationalFinding],
            ["Risk (inv.)",   report.scores.risk,          report.scores.riskFinding],
            ["Timing",        report.scores.timing,        report.scores.timingFinding],
          ].map(([label, score, finding]) => (
            <div key={label as string}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{label as string}</span>
                <span className="font-semibold text-primary">{(score as number).toFixed(1)} / 10</span>
              </div>
              <Progress value={(score as number) * 10} className="h-2" />
              <p className="mt-1 text-xs text-muted-foreground">{finding as string}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CapEx + Risks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Startup costs (CapEx) — {cur}</CardTitle></CardHeader>
          <CardContent><CapExBarChart data={report.financials.capEx} currency={cur} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Top risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {report.risks.slice(0, 6).map((r, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">{r.name}</div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{r.mitigation}</p>
                  </div>
                  <Badge
                    className={
                      r.level === "Low" ? "bg-emerald-100 text-emerald-800"
                      : r.level === "Med" ? "bg-amber-100 text-amber-800"
                      : "bg-rose-100 text-rose-800"
                    }
                  >
                    {r.level}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Strategic recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-foreground">
            {report.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};
