import { describe, expect, it } from "vitest";
import { makeReport } from "../fixtures/canonicalReport";
import { DEFAULT_SENSITIVITY, baseCase, projectOutcome } from "@/lib/sensitivity";

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

  it("represents non-positive contribution as no payback", () => {
    const report = makeReport();
    report.financials.projectType = "commercial";
    const baseScenario = report.financials.scenarios.find((scenario) => scenario.scenario === "Base Case");
    if (!baseScenario) throw new Error("Fixture is missing the base case");
    baseScenario.annualRevenue = "SAR 1";
    report.financials.opEx = [{ category: "Operations", monthly: 100, annual: 1_200 }];
    expect(projectOutcome(report, DEFAULT_SENSITIVITY).paybackMonths).toBe(Number.POSITIVE_INFINITY);
  });
});
