import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  DEFAULT_SENSITIVITY, baseCase, formatShort, projectOutcome, runMonteCarlo, tornado,
  type SensitivityInputs,
} from "@/lib/sensitivity";
import type { FeasibilityReport } from "@/types/analysis";

const SliderRow = ({
  label, sub, value, onChange, min, max, step, format,
}: {
  label: string; sub: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format: (v: number) => string;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-sm">
      <div>
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <Badge variant="outline" className="font-mono text-xs">{format(value)}</Badge>
    </div>
    <Slider
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={(v) => onChange(v[0])}
      aria-label={label}
      aria-valuetext={format(value)}
    />
  </div>
);

export const SensitivityPanel = ({ report }: { report: FeasibilityReport }) => {
  const [s, setS] = useState<SensitivityInputs>(DEFAULT_SENSITIVITY);
  const [mc, setMc] = useState<ReturnType<typeof runMonteCarlo> | null>(null);
  const [running, setRunning] = useState(false);

  const cur = report.financials.currency || "USD";
  const outcome = useMemo(() => projectOutcome(report, s), [report, s]);
  const baseOutcome = useMemo(() => projectOutcome(report, DEFAULT_SENSITIVITY), [report]);
  const tornadoData = useMemo(() => tornado(report, s), [report, s]);
  const { baseRev, projectType } = baseCase(report);
  const internal = projectType === "internal";

  const runSim = () => {
    setRunning(true);
    // Defer to next tick so UI updates
    setTimeout(() => {
      const result = runMonteCarlo(report, s, 2000, 2026);
      setMc(result);
      setRunning(false);
    }, 50);
  };

  const reset = () => { setS(DEFAULT_SENSITIVITY); setMc(null); };

  const fmt = (n: number) => `${cur} ${formatShort(n)}`;
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  const paybackDelta = outcome.paybackMonths != null && baseOutcome.paybackMonths != null
    ? baseOutcome.paybackMonths - outcome.paybackMonths
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">Financial sensitivity</h3>
          <p className="text-sm text-muted-foreground">Adjust assumptions and run a reproducible scenario simulation of the Year-1 financial outcome.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
          <Button size="sm" onClick={runSim} disabled={running} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> {running ? "Simulating…" : "Run 2,000 simulations"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="text-base">Drivers</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <SliderRow label={internal ? "Annual financial benefit" : "Revenue per unit"} sub={`Base ${fmt(baseRev)} / yr`} value={s.revenueMultiplier} onChange={(v) => setS({ ...s, revenueMultiplier: v })} min={0.5} max={1.5} step={0.05} format={pct} />
            <SliderRow label="Operating costs" sub="Multiplier on OpEx" value={s.costMultiplier} onChange={(v) => setS({ ...s, costMultiplier: v })} min={0.5} max={1.5} step={0.05} format={pct} />
            {!internal && <SliderRow label="Customer acquisition cost" sub="Higher = more expensive growth" value={s.cacMultiplier} onChange={(v) => setS({ ...s, cacMultiplier: v })} min={0.5} max={2} step={0.05} format={pct} />}
            {!internal && <SliderRow label="Conversion rate" sub="Funnel efficiency" value={s.conversionMultiplier} onChange={(v) => setS({ ...s, conversionMultiplier: v })} min={0.5} max={1.5} step={0.05} format={pct} />}
            <SliderRow label={internal ? "Internal adoption" : "Market adoption"} sub={internal ? "Share of modeled benefit realized" : "SOM penetration speed"} value={s.marketAdoptionMultiplier} onChange={(v) => setS({ ...s, marketAdoptionMultiplier: v })} min={0.5} max={1.5} step={0.05} format={pct} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: internal ? "Financial benefit" : "Revenue", value: fmt(outcome.financialValue), delta: outcome.financialValue - baseOutcome.financialValue },
              { label: "Net profit (Y1)", value: fmt(outcome.netProfit), delta: outcome.netProfit - baseOutcome.netProfit },
              { label: "Payback", value: outcome.paybackMonths == null ? "No payback" : `${outcome.paybackMonths.toFixed(1)} mo`, delta: paybackDelta },
              { label: "ROI Y1", value: `${(outcome.roi * 100).toFixed(0)}%`, delta: (outcome.roi - baseOutcome.roi) * 100 },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 font-display text-lg font-bold text-foreground">{kpi.value}</div>
                   <div className={`mt-0.5 text-[11px] ${kpi.delta == null ? "text-muted-foreground" : kpi.delta >= 0 ? "text-success" : "text-destructive"}`}>
                     {kpi.delta == null ? "Requires validation" : `${kpi.delta >= 0 ? "▲" : "▼"} vs base`}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Tornado — driver impact on net profit (±25%)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tornadoData} layout="vertical" margin={{ top: 4, right: 16, left: 100, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => formatShort(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis type="category" dataKey="variable" tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => `${cur} ${formatShort(v)}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="low" name="−25% scenario" fill="hsl(var(--destructive))" />
                    <Bar dataKey="high" name="+25% scenario" fill="hsl(var(--success))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {mc && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Scenario simulation — {mc.iterations.toLocaleString()} trials · seed {mc.seed}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Card><CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Probability of positive Year-1 financial outcome under selected assumptions</div>
                <div className="mt-1 font-display text-2xl font-bold text-success">{mc.positiveOutcomeProbability.toFixed(0)}%</div>
                <div className="text-[11px] text-muted-foreground">share of trials with a positive modeled outcome</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Net profit P50</div>
                <div className="mt-1 font-display text-lg font-bold text-foreground">{fmt(mc.netProfit.p50)}</div>
                <div className="text-[11px] text-muted-foreground">P10 {fmt(mc.netProfit.p10)} · P90 {fmt(mc.netProfit.p90)}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payback P50</div>
                <div className="mt-1 font-display text-lg font-bold text-foreground">{mc.paybackMonths.p50 == null ? "Not reached" : `${mc.paybackMonths.p50.toFixed(1)} mo`}</div>
                <div className="text-[11px] text-muted-foreground">
                  P10 {mc.paybackMonths.p10 == null ? "not reached" : `${mc.paybackMonths.p10.toFixed(1)} mo`} · P90 {mc.paybackMonths.p90 == null ? "not reached" : `${mc.paybackMonths.p90.toFixed(1)} mo`}
                </div>
                <div className="text-[11px] text-warning">Not reached in {mc.noPaybackProbability.toFixed(0)}% of trials</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">ROI P50</div>
                <div className="mt-1 font-display text-lg font-bold text-foreground">{(mc.roi.p50 * 100).toFixed(0)}%</div>
                <div className="text-[11px] text-muted-foreground">P10 {(mc.roi.p10 * 100).toFixed(0)}% · P90 {(mc.roi.p90 * 100).toFixed(0)}%</div>
              </CardContent></Card>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>{mc.disclaimer}</p>
              <p className="mt-1">Distributions: {mc.distributions.map((item) => `${item.name} (σ ${(item.standardDeviation * 100).toFixed(0)}%)`).join(" · ")}</p>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mc.histogram}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="count" name="Trials" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]}>
                    {mc.histogram.map((b, i) => (
                      <Cell key={i} fill={b.bucket.startsWith("-") ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
