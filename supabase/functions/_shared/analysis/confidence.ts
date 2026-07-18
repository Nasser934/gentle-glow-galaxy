import { FMART_DIMENSIONS, type FmartDimension, type FmartValues } from "./scoring.ts";

export interface ConfidenceContext {
  inputCompleteness: number;
  marketDirectSourceCount: number;
  primarySourceCount: number;
  hasPricingOrFinancialAssumptions: boolean;
  hasTeamExperience: boolean;
  isRegulatedSector: boolean;
  hasRegulatoryInput: boolean;
  unsupportedCalculationCount: number;
  contradictoryInputCount: number;
}
function toPercent(raw: unknown): number {
  let value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 0;
  if (value >= 0 && value <= 1) value *= 100;
  else if (value > 1 && value <= 10) value *= 10;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function applyConfidenceCaps(proposed: unknown, context: ConfidenceContext): {
  values: FmartValues;
  reasons: Record<FmartDimension, string[]>;
  average: number;
} {
  const record = typeof proposed === "object" && proposed !== null ? proposed as Record<string, unknown> : {};
  const values = {} as FmartValues;
  const reasons = {} as Record<FmartDimension, string[]>;
  for (const dimension of FMART_DIMENSIONS) {
    values[dimension] = toPercent(record[dimension]);
    reasons[dimension] = [];
  }

  const cap = (dimension: FmartDimension, maximum: number, reason: string) => {
    if (values[dimension] > maximum) values[dimension] = maximum;
    if (!reasons[dimension].includes(reason)) reasons[dimension].push(reason);
  };

  if (context.marketDirectSourceCount <= 0) cap("market", 45, "no_direct_market_sources");
  else if (context.marketDirectSourceCount === 1 || context.primarySourceCount === 0) cap("market", 65, "limited_independent_market_sources");
  if (!context.hasPricingOrFinancialAssumptions) cap("financial", 50, "missing_pricing_or_financial_assumptions");
  if (context.unsupportedCalculationCount > 0) cap("financial", 60, "unsupported_calculations");
  if (!context.hasTeamExperience) cap("achievability", 55, "missing_team_experience");
  if (context.isRegulatedSector && !context.hasRegulatoryInput) cap("risk", 45, "missing_regulatory_input");
  if (context.inputCompleteness < 60) {
    for (const dimension of FMART_DIMENSIONS) cap(dimension, 55, "low_input_completeness");
  }
  if (context.contradictoryInputCount > 0) {
    const maximum = context.contradictoryInputCount >= 2 ? 55 : 65;
    for (const dimension of FMART_DIMENSIONS) cap(dimension, maximum, "contradictory_inputs");
  }

  const average = FMART_DIMENSIONS.reduce((total, dimension) => total + values[dimension], 0) / FMART_DIMENSIONS.length;
  return { values, reasons, average };
}
