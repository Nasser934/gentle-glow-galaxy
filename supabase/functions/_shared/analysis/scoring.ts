export const SCORING_ENGINE_VERSION = "fmart-o-2.0.0";

export const FMART_DIMENSIONS = [
  "financial",
  "market",
  "achievability",
  "risk",
  "timing",
  "operational",
] as const;

export type FmartDimension = typeof FMART_DIMENSIONS[number];
export type FmartValues = Record<FmartDimension, number>;
export type LegacyVerdict = "PROCEED" | "PROCEED WITH CAUTION" | "REVISE" | "DO NOT PROCEED";

export interface VerdictGovernance {
  overallConfidencePct: number;
  inputQuality: number;
  hasUnmitigatedCriticalRisk: boolean;
  hasFinancialValidationBlocker?: boolean;
}

export class ScoringValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringValidationError";
  }
}

const GENERAL_DEFAULTS: FmartValues = {
  financial: 0.2,
  market: 0.2,
  achievability: 0.2,
  risk: 0.15,
  timing: 0.1,
  operational: 0.15,
};

const INDUSTRY_DEFAULTS: Array<{ match: RegExp; weights: FmartValues }> = [
  {
    match: /infrastructure|construction|real estate|energy|utilities|manufacturing/i,
    weights: { financial: 0.2, market: 0.1, achievability: 0.2, risk: 0.2, timing: 0.1, operational: 0.2 },
  },
  {
    match: /health|financial services|government|public sector|telecom/i,
    weights: { financial: 0.15, market: 0.15, achievability: 0.15, risk: 0.25, timing: 0.1, operational: 0.2 },
  },
  {
    match: /information technology|software|retail|e-commerce|education|food|beverage/i,
    weights: GENERAL_DEFAULTS,
  },
];

export function defaultWeightsForIndustry(industry: string | null | undefined): FmartValues {
  const match = INDUSTRY_DEFAULTS.find((candidate) => candidate.match.test(industry ?? ""));
  return { ...(match?.weights ?? GENERAL_DEFAULTS) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function validateDimensionScores(input: unknown): FmartValues {
  const record = asRecord(input);
  const output = {} as FmartValues;
  for (const dimension of FMART_DIMENSIONS) {
    const value = record[dimension];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
      throw new ScoringValidationError(`Invalid ${dimension} score`);
    }
    output[dimension] = value;
  }
  return output;
}

export function validateWeights(input: unknown, tolerance = 0.001): { valid: true; weights: FmartValues } | { valid: false } {
  const record = asRecord(input);
  const output = {} as FmartValues;
  let total = 0;
  for (const dimension of FMART_DIMENSIONS) {
    const value = record[dimension];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return { valid: false };
    output[dimension] = value;
    total += value;
  }
  if (Math.abs(total - 1) > tolerance) return { valid: false };
  return { valid: true, weights: output };
}

export function deriveAuthoritativeVerdict(score: number, governance: VerdictGovernance): {
  verdict: LegacyVerdict;
  baseVerdict: LegacyVerdict;
  overrideReasons: string[];
} {
  if (!Number.isFinite(score) || score < 0 || score > 10) throw new ScoringValidationError("Invalid overall score");
  const baseVerdict: LegacyVerdict = score >= 7.5
    ? "PROCEED"
    : score >= 6
      ? "PROCEED WITH CAUTION"
      : score >= 4.5
        ? "REVISE"
        : "DO NOT PROCEED";
  let verdict = baseVerdict;
  const overrideReasons: string[] = [];

  if (!Number.isFinite(governance.inputQuality) || governance.inputQuality < 60) {
    if (verdict !== "DO NOT PROCEED") verdict = "REVISE";
    overrideReasons.push("low_input_quality");
  }
  if (!Number.isFinite(governance.overallConfidencePct) || governance.overallConfidencePct < 70) {
    if (verdict === "PROCEED") verdict = "PROCEED WITH CAUTION";
    overrideReasons.push("low_model_estimated_confidence");
  }
  if (governance.hasUnmitigatedCriticalRisk) {
    if (verdict === "PROCEED" || verdict === "PROCEED WITH CAUTION") verdict = "REVISE";
    overrideReasons.push("unmitigated_critical_risk");
  }
  if (governance.hasFinancialValidationBlocker) {
    if (verdict !== "DO NOT PROCEED") verdict = "REVISE";
    overrideReasons.push("financial_validation_required");
  }

  return { verdict, baseVerdict, overrideReasons };
}

export function calculateAuthoritativeScore(args: {
  scores: unknown;
  modelWeights?: unknown;
  industry?: string | null;
  modelProposedOverall?: unknown;
  modelProposedVerdict?: unknown;
  governance: VerdictGovernance;
}) {
  const scores = validateDimensionScores(args.scores);
  const validatedWeights = validateWeights(args.modelWeights);
  const weights = validatedWeights.valid ? validatedWeights.weights : defaultWeightsForIndustry(args.industry);
  const weightsSource = validatedWeights.valid ? "model_validated" as const : "industry_default" as const;
  const internalWarnings = validatedWeights.valid ? [] : ["invalid_model_weights"];
  const serverCalculatedOverall = FMART_DIMENSIONS.reduce(
    (total, dimension) => total + scores[dimension] * weights[dimension],
    0,
  );
  const proposed = typeof args.modelProposedOverall === "number" && Number.isFinite(args.modelProposedOverall)
    ? args.modelProposedOverall
    : null;
  const decision = deriveAuthoritativeVerdict(serverCalculatedOverall, args.governance);

  return {
    scores,
    weights,
    serverCalculatedOverall,
    finalAuthoritativeScore: serverCalculatedOverall,
    displayScore: Math.round(serverCalculatedOverall * 10) / 10,
    verdict: decision.verdict,
    baseVerdict: decision.baseVerdict,
    overrideReasons: decision.overrideReasons,
    internalWarnings,
    audit: {
      modelProposedOverall: proposed,
      modelProposedVerdict: typeof args.modelProposedVerdict === "string" ? args.modelProposedVerdict : null,
      serverCalculatedOverall,
      difference: proposed === null ? null : proposed - serverCalculatedOverall,
      finalAuthoritativeScore: serverCalculatedOverall,
      weightsSource,
      scoringEngineVersion: SCORING_ENGINE_VERSION,
    },
  };
}
