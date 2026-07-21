import { describe, expect, it } from "vitest";
import { makeReport } from "../fixtures/canonicalReport";
import { DEFAULT_SENSITIVITY, baseCase, projectOutcome, runMonteCarlo } from "@/lib/sensitivity";

describe("sensitivity baselines", () => {
  it("treats an explicit project type as authoritative", () => {
    const report = makeReport();
    report.financials.projectType = "commercial";
    report.financials.ltvCacRatio = "N/A — internal platform";
    expect(baseCase(report).projectType).toBe("commercial");
  });

  it("does not invent revenue, operating cost, or CapEx when figures are absent", () => {
    const report = makeReport();
    report.financials.projectType = "commercial";
    report.financials.scenarios = [];
    report.financials.opEx = [];
    report.financials.capExTotal = { low: 0, high: 0, mid: 0 };
    expect(baseCase(report)).toMatchObject({ baseValue: 0, baseOpex: 0, baseCapex: 0 });
  });

  it("represents non-positive contribution as no payback without emitting Infinity", () => {
    const report = makeReport();
    report.financials.projectType = "commercial";
    const baseScenario = report.financials.scenarios.find((scenario) => scenario.scenario === "Base Case");
    if (!baseScenario) throw new Error("Fixture is missing the base case");
    baseScenario.annualRevenue = "SAR 1";
    report.financials.opEx = [{ category: "Operations", monthly: 100, annual: 1_200 }];
    expect(projectOutcome(report, DEFAULT_SENSITIVITY).paybackMonths).toBeNull();
  });

  it("keeps no-payback trials explicit in simulation percentiles", () => {
    const report = makeReport();
    report.financials.projectType = "commercial";
    report.financials.scenarios = [];
    report.financials.opEx = [];
    report.financials.capExTotal = { low: 100_000, high: 100_000, mid: 100_000 };
    const result = runMonteCarlo(report, DEFAULT_SENSITIVITY, 20, 2026);
    expect(result.noPaybackProbability).toBe(100);
    expect(result.paybackMonths.p50).toBeNull();
  });
});
