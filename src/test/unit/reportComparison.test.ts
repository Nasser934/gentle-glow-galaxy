import { describe, expect, it } from "vitest";
import { compareCanonicalReports } from "@/lib/reportComparison";
import { completeInputs, makeReport } from "@/test/fixtures/canonicalReport";

describe("report version comparison", () => {
  it("reports input, score, source, financial and risk differences", () => {
    const previous = makeReport();
    previous.scores.overall = 7.1;
    previous.qualityMetadata = {
      validationStatus: "valid",
      validationWarnings: [],
      scoringEngineVersion: "fmart-o-1.0.0",
      promptVersion: "p1",
      modelId: "model-a",
      sourceCount: 1,
      primarySourceCount: 1,
      unsupportedClaimCount: 0,
      financialWarningCount: 0,
      inputHash: "a",
      reportSchemaVersion: "1",
      generationTimestamp: "2026-01-01T00:00:00Z",
      researchTimestamp: "2026-01-01T00:00:00Z",
    };
    const next = structuredClone(previous);
    next.scores.overall = 7.2;
    next.scores.verdict = "PROCEED WITH CAUTION";
    next.financials.investmentRange = "USD 550K–750K";
    next.sources = [...(next.sources ?? []), {
      sourceId: "SRC-NEW",
      title: "New source",
      url: "https://example.edu/research",
      domain: "example.edu",
      publisher: "Example University",
      accessDate: "2026-07-18",
      sourceType: "academic",
      quality: "Academic or institutional",
    }];
    next.risks = [{ ...next.risks[0], level: "Med" }, {
      name: "New risk", probability: "Low", impact: "Med", level: "Low", mitigation: "Monitor",
    }];
    next.qualityMetadata = { ...next.qualityMetadata!, scoringEngineVersion: "fmart-o-2.0.0" };
    const nextInputs = { ...completeInputs, timeline: "12 – 18 months" };

    const result = compareCanonicalReports(previous, next, completeInputs, nextInputs);

    expect(result.changedInputs).toEqual(["timeline"]);
    expect(result.scoreDelta).toBeCloseTo(0.1);
    expect(result.verdictChanged).toBe(true);
    expect(result.addedSources).toContain("SRC-NEW");
    expect(result.financialChanges).toContain("Investment range");
    expect(result.addedRisks).toContain("New risk");
    expect(result.changedRiskLevels).toContain("Procurement delay");
    expect(result.scoringVersionMismatch).toBe(true);
  });
});
