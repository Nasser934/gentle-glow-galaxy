import { describe, expect, it } from "vitest";
import {
  detectProjectType,
  runScenarioSimulation,
} from "../../../supabase/functions/_shared/analysis/simulation";

describe("scenario simulation", () => {
  it("is reproducible with the same seed", () => {
    const input = {
      projectType: "commercial" as const,
      iterations: 500,
      seed: 42,
      assumptions: {
        annualRevenue: 1_000_000,
        annualOperatingCost: 600_000,
        capEx: 300_000,
        yearOneCapExRate: 0.2,
        adoptionRate: 0.8,
        revenueStdDev: 0.18,
        costStdDev: 0.12,
        adoptionStdDev: 0.1,
      },
    };
    expect(runScenarioSimulation(input)).toEqual(runScenarioSimulation(input));
  });

  it("uses avoided cost and productivity benefit for an internal project", () => {
    const result = runScenarioSimulation({
      projectType: "internal",
      iterations: 500,
      seed: 7,
      assumptions: {
        annualLabourCostAvoided: 800_000,
        annualProductivityBenefit: 400_000,
        annualOperatingCost: 300_000,
        capEx: 600_000,
        yearOneCapExRate: 0.2,
        adoptionRate: 0.75,
        benefitStdDev: 0.15,
        costStdDev: 0.1,
        adoptionStdDev: 0.08,
      },
    });
    expect(result.projectType).toBe("internal");
    expect(result.metricLabel).toBe("Probability of positive Year-1 financial outcome under selected assumptions");
    expect(result.disclaimer).toContain("not a trained prediction of project success");
    expect(result.distributions.map((item) => item.name)).not.toEqual(expect.arrayContaining(["CAC", "Conversion", "Subscribers"]));
    expect(result.distributions).toContainEqual({
      name: "Year-1 CapEx recognition",
      distribution: "Fixed",
      value: 0.2,
    });
  });

  it("selects internal and commercial models from the brief", () => {
    expect(detectProjectType({ businessModel: "Internal platform", revenueModel: "Cost avoidance" })).toBe("internal");
    expect(detectProjectType({ businessModel: "SaaS / Subscription Software", revenueModel: "Recurring subscription" })).toBe("commercial");
  });

  it.each([
    ["iterations", { iterations: 0 }],
    ["annual revenue", { assumptions: { annualRevenue: -1 } }],
    ["adoption", { assumptions: { adoptionRate: 2 } }],
    ["revenue deviation", { assumptions: { revenueStdDev: 1.1 } }],
    ["cost deviation", { assumptions: { costStdDev: 1.1 } }],
  ] as const)("rejects an invalid %s independently", (_label, override) => {
    const base = {
      projectType: "commercial",
      iterations: 10,
      seed: 1,
      assumptions: {
        annualRevenue: 10,
        annualOperatingCost: 1,
        capEx: 1,
        yearOneCapExRate: 0.2,
        adoptionRate: 0.8,
        revenueStdDev: 0.1,
        costStdDev: 0.1,
        adoptionStdDev: 0.1,
      },
    } as const;
    const input = {
      ...base,
      ...override,
      assumptions: { ...base.assumptions, ...("assumptions" in override ? override.assumptions : {}) },
    };
    expect(() => runScenarioSimulation(input)).toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1])("rejects invalid Year-1 CapEx rate %s", (yearOneCapExRate) => {
    expect(() => runScenarioSimulation({
      projectType: "commercial",
      iterations: 10,
      seed: 1,
      assumptions: {
        annualRevenue: 10,
        annualOperatingCost: 1,
        capEx: 1,
        yearOneCapExRate,
        adoptionRate: 0.8,
        revenueStdDev: 0.1,
        costStdDev: 0.1,
        adoptionStdDev: 0.1,
      },
    })).toThrow();
  });
});
