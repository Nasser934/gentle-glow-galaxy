// Lightweight Monte Carlo + sensitivity engine for feasibility reports.
// All math is dimensionless multipliers around the base case.

import type { FeasibilityReport } from "@/types/analysis";

export interface SensitivityInputs {
  revenueMultiplier: number;   // 0.5 - 1.5
  costMultiplier: number;      // 0.5 - 1.5
  cacMultiplier: number;       // 0.5 - 2.0
  conversionMultiplier: number;// 0.5 - 1.5
  marketAdoptionMultiplier: number; // 0.5 - 1.5
}

export const DEFAULT_SENSITIVITY: SensitivityInputs = {
  revenueMultiplier: 1,
  costMultiplier: 1,
  cacMultiplier: 1,
  conversionMultiplier: 1,
  marketAdoptionMultiplier: 1,
};

const num = (s?: string) => {
  const m = s?.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
};

export function baseCase(report: FeasibilityReport) {
  const baseRev =
    num(report.financials.scenarios.find((s) => s.scenario === "Base Case")?.annualRevenue) ||
    num(report.financials.scenarios[0]?.annualRevenue) || 1_000_000;
  const baseOpex = report.financials.opEx.reduce((sum, item) => sum + (item.annual || 0), 0) || baseRev * 0.6;
  const baseCapex = report.financials.capExTotal.mid || (report.financials.capExTotal.low + report.financials.capExTotal.high) / 2 || baseRev * 0.3;
  return { baseRev, baseOpex, baseCapex };
}

export interface ScenarioOutcome {
  revenue: number;
  opex: number;
  capex: number;
  grossProfit: number;
  netProfit: number;
  paybackMonths: number;
  roi: number; // 1y ROI on capex
}

export function projectOutcome(report: FeasibilityReport, s: SensitivityInputs): ScenarioOutcome {
  const { baseRev, baseOpex, baseCapex } = baseCase(report);
  const revenue = baseRev * s.revenueMultiplier * s.conversionMultiplier * s.marketAdoptionMultiplier;
  const opex = baseOpex * s.costMultiplier * (0.7 + 0.3 * s.cacMultiplier); // CAC partially impacts opex
  const capex = baseCapex * (0.9 + 0.1 * s.costMultiplier);
  const grossProfit = revenue - opex;
  const netProfit = grossProfit - capex * 0.2; // 20% capex amortization year 1
  const monthlyContribution = Math.max(grossProfit / 12, 1);
  const paybackMonths = capex > 0 ? capex / monthlyContribution : 0;
  const roi = capex > 0 ? netProfit / capex : 0;
  return { revenue, opex, capex, grossProfit, netProfit, paybackMonths, roi };
}

// Box-Muller normal sample
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface MonteCarloResult {
  iterations: number;
  netProfit: { p10: number; p50: number; p90: number; mean: number };
  paybackMonths: { p10: number; p50: number; p90: number; mean: number };
  roi: { p10: number; p50: number; p90: number; mean: number };
  successProbability: number; // % of trials with positive net profit
  histogram: Array<{ bucket: string; count: number }>;
}

const pct = (arr: number[], p: number) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
};

export function runMonteCarlo(report: FeasibilityReport, base: SensitivityInputs, iterations = 2000): MonteCarloResult {
  const profits: number[] = [];
  const paybacks: number[] = [];
  const rois: number[] = [];
  let successes = 0;

  for (let i = 0; i < iterations; i++) {
    const sample: SensitivityInputs = {
      revenueMultiplier: Math.max(0.2, base.revenueMultiplier * (1 + 0.18 * randn())),
      costMultiplier: Math.max(0.4, base.costMultiplier * (1 + 0.12 * randn())),
      cacMultiplier: Math.max(0.4, base.cacMultiplier * (1 + 0.20 * randn())),
      conversionMultiplier: Math.max(0.3, base.conversionMultiplier * (1 + 0.15 * randn())),
      marketAdoptionMultiplier: Math.max(0.3, base.marketAdoptionMultiplier * (1 + 0.18 * randn())),
    };
    const outcome = projectOutcome(report, sample);
    profits.push(outcome.netProfit);
    paybacks.push(Math.min(outcome.paybackMonths, 120));
    rois.push(outcome.roi);
    if (outcome.netProfit > 0) successes++;
  }

  // Histogram of net profit (10 buckets)
  const min = Math.min(...profits);
  const max = Math.max(...profits);
  const buckets = 10;
  const step = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, i) => ({
    bucket: formatShort(min + step * i),
    count: 0,
  }));
  for (const p of profits) {
    const idx = Math.min(buckets - 1, Math.floor((p - min) / step));
    histogram[idx].count++;
  }

  return {
    iterations,
    netProfit: { p10: pct(profits, 10), p50: pct(profits, 50), p90: pct(profits, 90), mean: profits.reduce((a, b) => a + b, 0) / profits.length },
    paybackMonths: { p10: pct(paybacks, 10), p50: pct(paybacks, 50), p90: pct(paybacks, 90), mean: paybacks.reduce((a, b) => a + b, 0) / paybacks.length },
    roi: { p10: pct(rois, 10), p50: pct(rois, 50), p90: pct(rois, 90), mean: rois.reduce((a, b) => a + b, 0) / rois.length },
    successProbability: (successes / iterations) * 100,
    histogram,
  };
}

// Tornado: hold all at base, swing one variable -25% / +25%, measure net profit delta
export interface TornadoBar {
  variable: string;
  low: number;
  high: number;
  span: number;
}

export function tornado(report: FeasibilityReport, base: SensitivityInputs): TornadoBar[] {
  const baseProfit = projectOutcome(report, base).netProfit;
  const vars: Array<keyof SensitivityInputs> = [
    "revenueMultiplier", "costMultiplier", "cacMultiplier", "conversionMultiplier", "marketAdoptionMultiplier",
  ];
  const labels: Record<string, string> = {
    revenueMultiplier: "Revenue per unit",
    costMultiplier: "Operating costs",
    cacMultiplier: "Customer acquisition cost",
    conversionMultiplier: "Conversion rate",
    marketAdoptionMultiplier: "Market adoption",
  };
  return vars
    .map((v) => {
      const low = projectOutcome(report, { ...base, [v]: base[v] * 0.75 }).netProfit - baseProfit;
      const high = projectOutcome(report, { ...base, [v]: base[v] * 1.25 }).netProfit - baseProfit;
      return { variable: labels[v], low, high, span: Math.abs(high - low) };
    })
    .sort((a, b) => b.span - a.span);
}

export function formatShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}
