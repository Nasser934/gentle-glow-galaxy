import { describe, expect, it } from "vitest";
import { buildCanonicalReport } from "../../../supabase/functions/_shared/analysis/canonical";
import { buildExportDecisionPack } from "@/lib/exportDecisionPack";
import { completeInputs, makeReport } from "../fixtures/canonicalReport";

describe("canonical report integration", () => {
  it("uses the same authoritative score and verdict in the saved report and export pack", () => {
    const canonical = buildCanonicalReport(makeReport(), completeInputs, {
      modelId: "google/gemini-3-flash-preview",
      promptVersion: "2026-07-18.1",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });
    const pack = buildExportDecisionPack(canonical, completeInputs);

    expect(canonical.scores.overall).toBeCloseTo(6.45, 10);
    expect(canonical.scores.verdict).toBe("PROCEED WITH CAUTION");
    expect(pack.score.overall).toBeCloseTo(canonical.scores.overall, 10);
    expect(pack.verdict.canonical).toBe("Proceed with Caution");
    expect(canonical.qualityMetadata?.scoringEngineVersion).toBeTruthy();
    expect(canonical.qualityMetadata?.modelId).toBe("google/gemini-3-flash-preview");
    expect(canonical.validationStatus).toBe("valid");
  });

  it("keeps unsupported financial claims labeled as estimates or requiring validation", () => {
    const report = makeReport();
    report.financials.scenarios[0].annualRevenue = "";
    const canonical = buildCanonicalReport(report, completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });
    const revenueClaim = canonical.claims?.find((claim) => claim.claimId === "CLM-FIN-OUTCOME");
    expect(revenueClaim?.displayStatus).toMatch(/Requires validation|AI-estimated assumption/);
  });

  it("adds deterministic calculation, market, financial, and risk claims for legacy reports", () => {
    const canonical = buildCanonicalReport(makeReport(), completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });

    expect(canonical.claims.map((claim) => claim.claimId)).toEqual(expect.arrayContaining([
      "CLM-SCORE-AUTHORITATIVE",
      "CLM-MARKET-SIZE",
      "CLM-FIN-OUTCOME",
      "CLM-RISK-PRIMARY",
    ]));
    const scoreClaim = canonical.claims.find((claim) => claim.claimId === "CLM-SCORE-AUTHORITATIVE");
    expect(scoreClaim?.provenance).toBe("Calculation");
    expect(scoreClaim?.composition.calculationPercent).toBe(100);
  });

  it("caps model confidence and input quality for server-classified thin briefs", () => {
    const report = makeReport();
    report.inputQualityScore = 99;
    report.scores.confidence = {
      financial: 99, market: 99, achievability: 99, risk: 99, timing: 99, operational: 99,
    };
    const canonical = buildCanonicalReport(report, completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
      serverInputClassification: "thin",
      inputWarningCodes: ["business_model_conflict"],
    });

    expect(canonical.inputQualityScore).toBeLessThanOrEqual(55);
    expect(Math.max(...Object.values(canonical.scores.confidence ?? {}))).toBeLessThanOrEqual(60);
    expect(canonical.validationStatus).toBe("valid_with_warnings");
    expect(canonical.qualityMetadata.validationWarnings).toContain("business_model_conflict");
  });

  it("normalizes chart points expressed in M/B shorthand to full currency units", () => {
    const report = makeReport();
    report.market.tamValue = "$2.1B";
    report.market.samValue = "$180M";
    report.market.growthChart = [
      { year: "2026", tam: 2.1, sam: 180 },
      { year: "2027", tam: 2.3, sam: 195 },
    ];
    const canonical = buildCanonicalReport(report, completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });

    expect(canonical.market.growthChart[0]).toMatchObject({ tam: 2_100_000_000, sam: 180_000_000 });
    expect(canonical.market.growthChart[1]).toMatchObject({ tam: 2_300_000_000, sam: 195_000_000 });
    expect(canonical.qualityMetadata.validationWarnings).toContain("market_chart_scale_normalized");
  });

  it("moves unlinked source percentages into AI inference", () => {
    const report = makeReport();
    report.claimEvidenceMap = [{
      claimId: "CLM-UNLINKED",
      claimText: "An unlinked market claim.",
      reportSection: "Market Analysis",
      userInputPercent: 0,
      webResearchPercent: 100,
      aiAssumptionPercent: 0,
      calculationPercent: 0,
      confidence: "High",
      sources: ["Not a stable source ID"],
      userCanImproveBy: "Add a direct source.",
    }];
    const canonical = buildCanonicalReport(report, completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });
    const claim = canonical.claims.find((item) => item.claimId === "CLM-UNLINKED");
    expect(claim?.supportingSourceIds).toEqual([]);
    expect(claim?.composition.citedSourcePercent).toBe(0);
    expect(claim?.composition.aiInferencePercent).toBe(100);
    expect(claim?.supportStatus).toBe("ai_inference");
  });

  it("applies the critical-risk override when the critical signal is in the risk name", () => {
    const report = makeReport();
    report.scores = {
      ...report.scores,
      financial: 9,
      market: 9,
      achievability: 9,
      risk: 9,
      timing: 9,
      operational: 9,
      confidence: {
        financial: 95,
        market: 95,
        achievability: 95,
        risk: 95,
        timing: 95,
        operational: 95,
      },
    };
    report.risks = [{
      name: "Critical regulatory approval dependency",
      probability: "High",
      impact: "High",
      level: "High",
      mitigation: "",
    }];
    const canonical = buildCanonicalReport(report, completeInputs, {
      modelId: "test-model",
      promptVersion: "test-prompt",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-18T00:00:00.000Z",
    });

    expect(canonical.scores.verdict).toBe("REVISE");
    expect(canonical.decision?.blockers).toContain("unmitigated critical risk");
  });
});
