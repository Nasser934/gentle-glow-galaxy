import type { FeasibilityReport } from "@/types/analysis";
import { numericValue } from "@/lib/numbers";
import { isInternalProject } from "@/lib/format";
import { SIMULATION_DISCLAIMER } from "../../supabase/functions/_shared/analysis/simulation";

export interface SensitivityInputs {
  revenueMultiplier: number;
  costMultiplier: number;
  cacMultiplier: number;
  conversionMultiplier: number;
  marketAdoptionMultiplier: number;
}
export const DEFAULT_SENSITIVITY: SensitivityInputs = {
  revenueMultiplier: 1,
  costMultiplier: 1,
  cacMultiplier: 1,
  conversionMultiplier: 1,
  marketAdoptionMultiplier: 1,
};

export function baseCase(report: FeasibilityReport) {
  const projectType: "commercial" | "internal" = isInternalProject(report) ? "internal" : "commercial";
  const baseScenario = report.financials.scenarios.find((scenario) => scenario.scenario === "Base Case")
    ?? report.financials.scenarios[0];
  const internalBenefit = numericValue(baseScenario?.annualFinancialBenefit, 0)
    || numericValue(baseScenario?.annualValueDisplay, 0)
    || numericValue(baseScenario?.annualLabourCostAvoided, 0) + numericValue(baseScenario?.annualProductivityBenefit, 0);
  const commercialRevenue = numericValue(baseScenario?.annualRevenue, 0);
  const baseValue = projectType === "internal"
    ? internalBenefit
    : commercialRevenue;
  const baseOpex = report.financials.opEx.reduce((sum, item) => sum + (item.annual || 0), 0);
  const baseCapex = report.financials.capExTotal.mid
    || (report.financials.capExTotal.low + report.financials.capExTotal.high) / 2
    || 0;
  return { projectType, baseValue, baseRev: baseValue, baseOpex, baseCapex };
}

export interface ScenarioOutcome {
  projectType: "commercial" | "internal";
  financialValue: number;
  revenue: number;
  opex: number;
  capex: number;
  grossProfit: number;
  netProfit: number;
  paybackMonths: number | null;
  roi: number;
}

export function projectOutcome(report: FeasibilityReport, sensitivity: SensitivityInputs): ScenarioOutcome {
  const { projectType, baseValue, baseOpex, baseCapex } = baseCase(report);
  const commercialGrowth = sensitivity.conversionMultiplier * sensitivity.marketAdoptionMultiplier;
  const internalAdoption = sensitivity.marketAdoptionMultiplier;
  const financialValue = baseValue * sensitivity.revenueMultiplier
    * (projectType === "internal" ? internalAdoption : commercialGrowth);
  const acquisitionFactor = projectType === "internal" ? 1 : 0.7 + 0.3 * sensitivity.cacMultiplier;
  const opex = baseOpex * sensitivity.costMultiplier * acquisitionFactor;
  const capex = baseCapex * (0.9 + 0.1 * sensitivity.costMultiplier);
  const grossProfit = financialValue - opex;
  const netProfit = grossProfit - capex * 0.2;
  const monthlyContribution = grossProfit / 12;
  const paybackMonths = capex <= 0 ? 0 : monthlyContribution > 0 ? capex / monthlyContribution : null;
  const roi = capex > 0 ? netProfit / capex : 0;
  return { projectType, financialValue, revenue: financialValue, opex, capex, grossProfit, netProfit, paybackMonths, roi };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  };
}

function randn(random: () => number) {
  let u = random();
  let v = random();
  if (u <= Number.EPSILON) u = Number.EPSILON;
  if (v <= Number.EPSILON) v = Number.EPSILON;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface MonteCarloResult {
  iterations: number;
  seed: number;
  projectType: "commercial" | "internal";
  disclaimer: string;
  distributions: Array<{ name: string; standardDeviation: number }>;
  netProfit: { p10: number; p50: number; p90: number; mean: number };
  paybackMonths: { p10: number | null; p50: number | null; p90: number | null; mean: number | null };
  noPaybackProbability: number;
  roi: { p10: number; p50: number; p90: number; mean: number };
  positiveOutcomeProbability: number;
  successProbability: number;
  histogram: Array<{ bucket: string; count: number }>;
}

const percentile = (values: number[], percentage: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((percentage / 100) * (sorted.length - 1))));
  return sorted[index];
};

const percentileOrNull = (values: Array<number | null>, percentage: number): number | null => {
  const sorted = values.map((value) => value ?? Number.POSITIVE_INFINITY).sort((a, b) => a - b);
  const value = sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((percentage / 100) * (sorted.length - 1))))];
  return Number.isFinite(value) ? value : null;
};

export function runMonteCarlo(
  report: FeasibilityReport,
  base: SensitivityInputs,
  iterations = 2_000,
  seed = 2_026,
): MonteCarloResult {
  if (!Number.isInteger(iterations) || iterations < 10 || iterations > 100_000) throw new Error("Invalid simulation iteration count");
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error("Invalid simulation seed");
  const projectType = baseCase(report).projectType;
  const random = seededRandom(seed);
  const profits: number[] = [];
  const paybacks: Array<number | null> = [];
  const rois: number[] = [];
  let positive = 0;

  for (let index = 0; index < iterations; index += 1) {
    const sample: SensitivityInputs = {
      revenueMultiplier: Math.max(0.2, base.revenueMultiplier * (1 + 0.18 * randn(random))),
      costMultiplier: Math.max(0.4, base.costMultiplier * (1 + 0.12 * randn(random))),
      cacMultiplier: projectType === "internal" ? 1 : Math.max(0.4, base.cacMultiplier * (1 + 0.2 * randn(random))),
      conversionMultiplier: projectType === "internal" ? 1 : Math.max(0.3, base.conversionMultiplier * (1 + 0.15 * randn(random))),
      marketAdoptionMultiplier: Math.max(0.3, base.marketAdoptionMultiplier * (1 + 0.18 * randn(random))),
    };
    const outcome = projectOutcome(report, sample);
    profits.push(outcome.netProfit);
    paybacks.push(outcome.paybackMonths == null ? null : Math.min(outcome.paybackMonths, 120));
    rois.push(outcome.roi);
    if (outcome.netProfit > 0) positive += 1;
  }

  const minimum = Math.min(...profits);
  const maximum = Math.max(...profits);
  const bucketCount = 10;
  const step = (maximum - minimum) / bucketCount || 1;
  const histogram = Array.from({ length: bucketCount }, (_, index) => ({
    bucket: formatShort(minimum + step * index),
    count: 0,
  }));
  for (const profit of profits) {
    const index = Math.min(bucketCount - 1, Math.floor((profit - minimum) / step));
    histogram[index].count += 1;
  }
  const positiveOutcomeProbability = positive / iterations * 100;
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const reachedPaybacks = paybacks.filter((value): value is number => value !== null);
  return {
    iterations,
    seed,
    projectType,
    disclaimer: SIMULATION_DISCLAIMER,
    distributions: projectType === "internal"
      ? [
          { name: "Cost savings and productivity benefit", standardDeviation: 0.18 },
          { name: "Operating cost", standardDeviation: 0.12 },
          { name: "Internal adoption", standardDeviation: 0.18 },
        ]
      : [
          { name: "Revenue", standardDeviation: 0.18 },
          { name: "Operating cost", standardDeviation: 0.12 },
          { name: "Customer acquisition cost", standardDeviation: 0.2 },
          { name: "Conversion", standardDeviation: 0.15 },
          { name: "Market adoption", standardDeviation: 0.18 },
        ],
    netProfit: { p10: percentile(profits, 10), p50: percentile(profits, 50), p90: percentile(profits, 90), mean: mean(profits) },
    paybackMonths: {
      p10: percentileOrNull(paybacks, 10),
      p50: percentileOrNull(paybacks, 50),
      p90: percentileOrNull(paybacks, 90),
      mean: reachedPaybacks.length ? mean(reachedPaybacks) : null,
    },
    noPaybackProbability: (iterations - reachedPaybacks.length) / iterations * 100,
    roi: { p10: percentile(rois, 10), p50: percentile(rois, 50), p90: percentile(rois, 90), mean: mean(rois) },
    positiveOutcomeProbability,
    successProbability: positiveOutcomeProbability,
    histogram,
  };
}

export interface TornadoBar {
  variable: string;
  low: number;
  high: number;
  span: number;
}

export function tornado(report: FeasibilityReport, base: SensitivityInputs): TornadoBar[] {
  const projectType = baseCase(report).projectType;
  const baseProfit = projectOutcome(report, base).netProfit;
  const variables: Array<keyof SensitivityInputs> = projectType === "internal"
    ? ["revenueMultiplier", "costMultiplier", "marketAdoptionMultiplier"]
    : ["revenueMultiplier", "costMultiplier", "cacMultiplier", "conversionMultiplier", "marketAdoptionMultiplier"];
  const labels: Record<keyof SensitivityInputs, string> = {
    revenueMultiplier: projectType === "internal" ? "Financial benefit" : "Revenue per unit",
    costMultiplier: "Operating costs",
    cacMultiplier: "Customer acquisition cost",
    conversionMultiplier: "Conversion rate",
    marketAdoptionMultiplier: projectType === "internal" ? "Internal adoption" : "Market adoption",
  };
  return variables
    .map((variable) => {
      const low = projectOutcome(report, { ...base, [variable]: base[variable] * 0.75 }).netProfit - baseProfit;
      const high = projectOutcome(report, { ...base, [variable]: base[variable] * 1.25 }).netProfit - baseProfit;
      return { variable: labels[variable], low, high, span: Math.abs(high - low) };
    })
    .sort((left, right) => right.span - left.span);
}

export function formatShort(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1e12) return `${sign}${(absolute / 1e12).toFixed(1)}T`;
  if (absolute >= 1e9) return `${sign}${(absolute / 1e9).toFixed(1)}B`;
  if (absolute >= 1e6) return `${sign}${(absolute / 1e6).toFixed(1)}M`;
  if (absolute >= 1e3) return `${sign}${(absolute / 1e3).toFixed(1)}K`;
  return `${sign}${absolute.toFixed(0)}`;
}
