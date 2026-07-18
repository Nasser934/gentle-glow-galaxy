import { describe, expect, it } from "vitest";
import { applyConfidenceCaps } from "../../../supabase/functions/_shared/analysis/confidence";

const proposed = {
  financial: 95,
  market: 95,
  achievability: 95,
  risk: 95,
  timing: 95,
  operational: 95,
};

describe("deterministic model-estimated confidence caps", () => {
  it("caps Market when there are no direct market sources", () => {
    const result = applyConfidenceCaps(proposed, {
      inputCompleteness: 90,
      marketDirectSourceCount: 0,
      primarySourceCount: 0,
      hasPricingOrFinancialAssumptions: true,
      hasTeamExperience: true,
      isRegulatedSector: false,
      hasRegulatoryInput: false,
      unsupportedCalculationCount: 0,
      contradictoryInputCount: 0,
    });
    expect(result.values.market).toBeLessThanOrEqual(45);
    expect(result.reasons.market).toContain("no_direct_market_sources");
  });

  it("caps Financial when pricing or financial assumptions are absent", () => {
    const result = applyConfidenceCaps(proposed, {
      inputCompleteness: 90,
      marketDirectSourceCount: 3,
      primarySourceCount: 1,
      hasPricingOrFinancialAssumptions: false,
      hasTeamExperience: true,
      isRegulatedSector: false,
      hasRegulatoryInput: false,
      unsupportedCalculationCount: 0,
      contradictoryInputCount: 0,
    });
    expect(result.values.financial).toBeLessThanOrEqual(50);
  });

  it("caps Achievability when team experience is absent", () => {
    const result = applyConfidenceCaps(proposed, {
      inputCompleteness: 90,
      marketDirectSourceCount: 3,
      primarySourceCount: 1,
      hasPricingOrFinancialAssumptions: true,
      hasTeamExperience: false,
      isRegulatedSector: false,
      hasRegulatoryInput: false,
      unsupportedCalculationCount: 0,
      contradictoryInputCount: 0,
    });
    expect(result.values.achievability).toBeLessThanOrEqual(55);
  });

  it("caps Risk for a regulated sector without regulatory input", () => {
    const result = applyConfidenceCaps(proposed, {
      inputCompleteness: 90,
      marketDirectSourceCount: 3,
      primarySourceCount: 1,
      hasPricingOrFinancialAssumptions: true,
      hasTeamExperience: true,
      isRegulatedSector: true,
      hasRegulatoryInput: false,
      unsupportedCalculationCount: 0,
      contradictoryInputCount: 0,
    });
    expect(result.values.risk).toBeLessThanOrEqual(45);
  });

  it("reduces every dimension for poor or contradictory inputs", () => {
    const result = applyConfidenceCaps(proposed, {
      inputCompleteness: 35,
      marketDirectSourceCount: 3,
      primarySourceCount: 1,
      hasPricingOrFinancialAssumptions: true,
      hasTeamExperience: true,
      isRegulatedSector: false,
      hasRegulatoryInput: false,
      unsupportedCalculationCount: 2,
      contradictoryInputCount: 2,
    });
    expect(Math.max(...Object.values(result.values))).toBeLessThanOrEqual(55);
  });
});
