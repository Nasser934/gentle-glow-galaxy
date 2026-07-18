import { describe, expect, it } from "vitest";
import {
  SCORING_ENGINE_VERSION,
  ScoringValidationError,
  calculateAuthoritativeScore,
  deriveAuthoritativeVerdict,
} from "../../../supabase/functions/_shared/analysis/scoring";

const scores = {
  financial: 8,
  market: 7,
  achievability: 6,
  risk: 5,
  timing: 9,
  operational: 4,
};

const weights = {
  financial: 0.2,
  market: 0.2,
  achievability: 0.2,
  risk: 0.15,
  timing: 0.1,
  operational: 0.15,
};

describe("authoritative FMART-O scoring", () => {
  it("calculates the precise weighted score and ignores the model overall/verdict", () => {
    const result = calculateAuthoritativeScore({
      scores,
      modelWeights: weights,
      industry: "Information Technology",
      modelProposedOverall: 9.9,
      modelProposedVerdict: "PROCEED",
      governance: { overallConfidencePct: 75, inputQuality: 80, hasUnmitigatedCriticalRisk: false },
    });

    expect(result.serverCalculatedOverall).toBeCloseTo(6.45, 10);
    expect(result.finalAuthoritativeScore).toBeCloseTo(6.45, 10);
    expect(result.displayScore).toBe(6.5);
    expect(result.verdict).toBe("PROCEED WITH CAUTION");
    expect(result.audit.modelProposedOverall).toBe(9.9);
    expect(result.audit.difference).toBeCloseTo(3.45, 10);
    expect(result.audit.scoringEngineVersion).toBe(SCORING_ENGINE_VERSION);
  });

  it("falls back to documented industry weights when the total is invalid", () => {
    const result = calculateAuthoritativeScore({
      scores,
      modelWeights: { ...weights, operational: 0.3 },
      industry: "Infrastructure & Construction",
      governance: { overallConfidencePct: 80, inputQuality: 80, hasUnmitigatedCriticalRisk: false },
    });
    expect(result.audit.weightsSource).toBe("industry_default");
    expect(result.serverCalculatedOverall).toBeCloseTo(6.2, 10);
    expect(result.internalWarnings).toContain("invalid_model_weights");
  });

  it("falls back when a weight is missing", () => {
    const { operational: _omitted, ...missingWeight } = weights;
    const result = calculateAuthoritativeScore({
      scores,
      modelWeights: missingWeight,
      industry: "Information Technology",
      governance: { overallConfidencePct: 80, inputQuality: 80, hasUnmitigatedCriticalRisk: false },
    });
    expect(result.audit.weightsSource).toBe("industry_default");
  });

  it.each([
    [{ ...scores, financial: -0.01 }, "financial"],
    [{ ...scores, market: 10.01 }, "market"],
    [{ ...scores, risk: Number.NaN }, "risk"],
    [{ ...scores, timing: Number.POSITIVE_INFINITY }, "timing"],
    [{ ...scores, operational: "invalid" }, "operational"],
  ])("rejects invalid dimension output %#", (invalidScores, dimension) => {
    expect(() => calculateAuthoritativeScore({
      scores: invalidScores,
      modelWeights: weights,
      industry: "Information Technology",
      governance: { overallConfidencePct: 80, inputQuality: 80, hasUnmitigatedCriticalRisk: false },
    })).toThrowError(new ScoringValidationError(`Invalid ${dimension} score`));
  });
});
describe("authoritative verdict governance", () => {
  it.each([
    [7.5, "PROCEED"],
    [7.49, "PROCEED WITH CAUTION"],
    [6, "PROCEED WITH CAUTION"],
    [5.99, "REVISE"],
    [4.5, "REVISE"],
    [4.49, "DO NOT PROCEED"],
  ] as const)("maps score %s to %s", (score, verdict) => {
    expect(deriveAuthoritativeVerdict(score, {
      overallConfidencePct: 80,
      inputQuality: 80,
      hasUnmitigatedCriticalRisk: false,
    }).verdict).toBe(verdict);
  });

  it("downgrades a proceed score when model-estimated confidence is low", () => {
    expect(deriveAuthoritativeVerdict(8, {
      overallConfidencePct: 45,
      inputQuality: 80,
      hasUnmitigatedCriticalRisk: false,
    }).verdict).toBe("PROCEED WITH CAUTION");
  });

  it("overrides the score when input quality is too low", () => {
    const result = deriveAuthoritativeVerdict(9, {
      overallConfidencePct: 90,
      inputQuality: 40,
      hasUnmitigatedCriticalRisk: false,
    });
    expect(result.verdict).toBe("REVISE");
    expect(result.overrideReasons).toContain("low_input_quality");
  });

  it("overrides the score for an unmitigated critical risk", () => {
    const result = deriveAuthoritativeVerdict(9, {
      overallConfidencePct: 90,
      inputQuality: 90,
      hasUnmitigatedCriticalRisk: true,
    });
    expect(result.verdict).toBe("REVISE");
    expect(result.overrideReasons).toContain("unmitigated_critical_risk");
  });
});
