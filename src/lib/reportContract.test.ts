import { describe, expect, it } from "vitest";
import {
  normalizeExternalAnalysis,
  validateCanonicalReportData,
} from "@/lib/reportContract";
import {
  canonicalInputsFixture,
  canonicalReportFixture,
  legacyThermoFlowExternalPayload,
  repairedThermoFlowRowFixture,
} from "@/test/fixtures/reports";

describe("canonical report contract", () => {
  it("accepts an existing in-app ConceptInputs and FeasibilityReport pair", () => {
    const result = validateCanonicalReportData(canonicalInputsFixture, canonicalReportFixture);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts an external agent that submits the canonical application shape", () => {
    const result = normalizeExternalAnalysis({
      title: canonicalInputsFixture.projectName,
      industry: canonicalInputsFixture.industry,
      inputs: canonicalInputsFixture,
      analysis: canonicalReportFixture,
    });

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected canonical external payload to validate");
    expect(result.inputs).toEqual(canonicalInputsFixture);
    expect(result.output.scores.overall).toBeCloseTo(7.5, 2);
    expect(result.output.nextSteps).toEqual(canonicalReportFixture.nextSteps);
  });

  it("normalizes the confirmed legacy ThermoFlow external-agent shape", () => {
    const result = normalizeExternalAnalysis(legacyThermoFlowExternalPayload);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected legacy payload to normalize");

    expect(result.inputs.projectName).toBe("ThermoFlow DC");
    expect(result.inputs.assumptions).toBe("Phased deployment\nExisting utility corridors");
    expect(result.output.scores.financial).toBe(7.2);
    expect(result.output.scores.achievability).toBe(7.5);
    expect(result.output.scores.overall).toBeCloseTo(6.87, 2);
    expect(result.output.scores.verdict).toBe("PROCEED WITH CAUTION");
    expect(result.output.executiveSummary).toContain("ThermoFlow");
    expect(result.output.nextSteps).toEqual(["Commission an independent demand study."]);
    expect(result.output.fundingMix).toEqual([]);
    expect(result.output.competitors[0]?.name).toBe("Incumbent utility");
    expect(result.output.competitors[0]?.model).toContain("Installed base");
    expect(result.output.competitors[0]?.edge).toBe("Phased modular delivery");
    expect(result.output.financials.capExTotal).toEqual({
      low: 1_250_000,
      high: 1_250_000,
      mid: 1_250_000,
    });
    expect(result.output.financials.capEx).toHaveLength(1);
    expect(result.output.financials.opEx).toHaveLength(1);
    expect(result.output.financials.scenarios[0]).toMatchObject({
      annualRevenue: "USD 2400000",
      breakEven: "Month 40–46",
    });
    expect(result.output.research?.citations[0]).toMatchObject({
      source: "example.gov",
      takeaway: "A cited market signal supports demand validation.",
    });
    expect(result.output.evidenceWarnings).toContain(
      "Market and financial forecasts were not supplied.",
    );
  });

  it("reports missing scores instead of treating incompatible output as valid", () => {
    const broken = structuredClone(canonicalReportFixture) as unknown as Record<string, unknown>;
    delete broken.scores;

    const result = validateCanonicalReportData(canonicalInputsFixture, broken);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "output.scores" }),
      ]),
    );
  });

  it("rejects malformed optional evidence arrays before downstream .map calls", () => {
    const broken = {
      ...structuredClone(canonicalReportFixture),
      scoreExplanation: { unexpected: true },
    };

    const result = validateCanonicalReportData(canonicalInputsFixture, broken);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "output.scoreExplanation" }),
      ]),
    );
  });

  it.each([
    "market",
    "financials",
    "risks",
    "fundingMix",
    "competitors",
    "recommendations",
    "nextSteps",
  ])("reports a missing dashboard field: %s", (field) => {
    const broken = structuredClone(canonicalReportFixture) as unknown as Record<string, unknown>;
    delete broken[field];

    const result = validateCanonicalReportData(canonicalInputsFixture, broken);

    expect(result.valid).toBe(false);
    if ("output" in result) throw new Error("expected invalid report");
    expect(result.issues.some((issue) => issue.path === `output.${field}`)).toBe(true);
  });

  it("rejects an external analysis without authoritative score inputs", () => {
    const invalid = structuredClone(legacyThermoFlowExternalPayload) as {
      analysis: Record<string, unknown>;
    };
    delete invalid.analysis.fmarto_scores;

    const result = normalizeExternalAnalysis(invalid);

    expect(result.valid).toBe(false);
    if ("output" in result) throw new Error("expected invalid payload");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "analysis.scores" }),
      ]),
    );
  });

  it("rejects non-HTTP evidence links before they reach report anchors", () => {
    const unsafe = structuredClone(legacyThermoFlowExternalPayload) as unknown as {
      analysis: {
        claims: Array<{
          sources: Array<{ url: string }>;
        }>;
      };
    };
    unsafe.analysis.claims[0].sources[0].url = "javascript:alert(document.domain)";

    const result = normalizeExternalAnalysis(unsafe);

    expect(result.valid).toBe(false);
    if ("output" in result) throw new Error("expected unsafe citation to be rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "output.research.citations.0.url",
          message: expect.stringMatching(/HTTP\(S\)/),
        }),
      ]),
    );
  });

  it("falls back to nonnegative equal weights when legacy weights are unsafe", () => {
    const weighted = structuredClone(legacyThermoFlowExternalPayload) as unknown as {
      analysis: {
        fmarto_scores: {
          weights: Record<string, number>;
        };
      };
    };
    weighted.analysis.fmarto_scores.weights = {
      financial: 2,
      market: -1,
      achievability: 0,
      risk: 0,
      timing: 0,
      operational: 0,
    };

    const result = normalizeExternalAnalysis(weighted);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected unsafe legacy weights to fall back safely");
    expect(Object.values(result.output.scores.weights ?? {})).toEqual(
      expect.arrayContaining([
        expect.closeTo(1 / 6, 8),
      ]),
    );
    expect(result.output.scores.overall).toBeGreaterThanOrEqual(0);
    expect(result.output.scores.overall).toBeLessThanOrEqual(10);
  });

  it("loads the repaired CAI-2026-00000094 object without changing row identity", () => {
    const normalized = normalizeExternalAnalysis(legacyThermoFlowExternalPayload, {
      reportId: repairedThermoFlowRowFixture.display_id,
    });

    expect(normalized.valid).toBe(true);
    if (!normalized.valid) throw new Error("expected repaired report");
    expect(normalized.output.reportId).toBe(repairedThermoFlowRowFixture.display_id);
    expect(repairedThermoFlowRowFixture.id).toBe("abe31755-972d-4b8b-86e3-62657db46f1d");
    expect(repairedThermoFlowRowFixture.slug).toBe("63873c41fb1a058bc5f3a2b2f5477cc3");
  });
});
