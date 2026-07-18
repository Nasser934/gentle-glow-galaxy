import { describe, expect, it } from "vitest";
import {
  EVIDENCE_METHOD_LABEL,
  assessClaimCoverage,
  estimateEvidenceComposition,
  mapClaimsToSources,
  normalizeComposition,
  normalizeClaim,
} from "../../../supabase/functions/_shared/analysis/evidence";
import {
  deriveAssumptionRegister,
  deriveClaimEvidenceMap,
  deriveScoreExplanation,
} from "@/lib/evidence";
import { demoInputs, demoReport } from "@/data/demoReport";

const source = {
  sourceId: "SRC-001",
  title: "Official statistics",
  url: "https://example.gov/data",
  domain: "example.gov",
  publisher: "Example regulator",
  publicationDate: "2026-01-01",
  accessDate: "2026-07-18",
  sourceType: "government" as const,
  quality: "Government or regulator" as const,
};

describe("estimated evidence composition", () => {
  it("labels the method as a heuristic", () => {
    expect(EVIDENCE_METHOD_LABEL).toBe("Heuristic estimate based on input completeness and available sources.");
  });

  it("includes AI inference when there are no citations", () => {
    const result = estimateEvidenceComposition({ inputQuality: 35, sources: [] });
    expect(result.aiInferencePercent).toBeGreaterThan(0);
    expect(result.userInputPercent + result.citedSourcePercent + result.calculationPercent + result.aiInferencePercent).toBe(100);
  });

  it("does not turn one citation into exact-looking full provenance", () => {
    const result = estimateEvidenceComposition({ inputQuality: 55, sources: [source] });
    expect(result.citedSourcePercent).toBeLessThan(50);
    expect(result.aiInferencePercent).toBeGreaterThan(0);
  });

  it("gives strong user inputs more weight while retaining an inference floor", () => {
    const result = estimateEvidenceComposition({ inputQuality: 95, sources: [source, { ...source, sourceId: "SRC-002", domain: "example.edu" }] });
    expect(result.userInputPercent).toBeGreaterThan(result.aiInferencePercent);
    expect(result.aiInferencePercent).toBeGreaterThanOrEqual(5);
  });

  it("normalizes invalid percentages to exactly 100", () => {
    expect(normalizeComposition({ userInputPercent: 80, citedSourcePercent: 40, calculationPercent: -10, aiInferencePercent: Number.NaN }))
      .toEqual({ userInputPercent: 67, citedSourcePercent: 33, calculationPercent: 0, aiInferencePercent: 0 });
  });
});

describe("claim provenance and explicit sources", () => {
  it("classifies an AI-only claim and does not hide AI inference", () => {
    const claim = normalizeClaim({
      claimId: "CLM-001",
      claimText: "Demand will grow.",
      reportSection: "Market",
      provenance: "AI inference",
      supportingSourceIds: [],
      conflictingSourceIds: [],
    });
    expect(claim.provenance).toBe("AI inference");
    expect(claim.supportStatus).toBe("ai_inference");
    expect(claim.composition.aiInferencePercent).toBe(100);
  });

  it("classifies a mixed claim with a valid composition", () => {
    const claim = normalizeClaim({
      claimId: "CLM-002",
      claimText: "The calculated payback uses a cited wage benchmark.",
      reportSection: "Financial",
      provenance: "Mixed",
      supportingSourceIds: ["SRC-001"],
      conflictingSourceIds: [],
      composition: { userInputPercent: 25, citedSourcePercent: 25, calculationPercent: 40, aiInferencePercent: 10 },
    });
    expect(Object.values(claim.composition).reduce((total, value) => total + value, 0)).toBe(100);
    expect(claim.supportStatus).toBe("supported");
  });

  it("uses stable IDs only and never keyword-matches unrelated citations", () => {
    const claims = [normalizeClaim({
      claimId: "CLM-003",
      claimText: "Market risk is material.",
      reportSection: "Risk",
      provenance: "Unknown",
      supportingSourceIds: [],
      conflictingSourceIds: [],
    })];
    const mapped = mapClaimsToSources(claims, [source]);
    expect(mapped[0].supportingSources).toEqual([]);
    expect(mapped[0].supportStatus).toBe("unsupported");
  });

  it("maps direct and conflicting sources by explicit IDs", () => {
    const claims = [normalizeClaim({
      claimId: "CLM-004",
      claimText: "Official statistics support the sizing.",
      reportSection: "Market",
      provenance: "Cited source",
      supportingSourceIds: ["SRC-001"],
      conflictingSourceIds: ["SRC-002"],
    })];
    const mapped = mapClaimsToSources(claims, [source, { ...source, sourceId: "SRC-002", domain: "example.edu" }]);
    expect(mapped[0].supportingSources.map((item) => item.sourceId)).toEqual(["SRC-001"]);
    expect(mapped[0].conflictingSources.map((item) => item.sourceId)).toEqual(["SRC-002"]);
    expect(mapped[0].supportStatus).toBe("conflicting");
  });
});

describe("claim-aware research coverage", () => {
  it("does not call citation count sufficient when no claim is directly mapped", () => {
    const sources = [0, 1, 2, 3].map((index) => ({
      ...source,
      sourceId: `SRC-00${index + 1}`,
      domain: `official-${index % 3}.gov`,
      url: `https://official-${index % 3}.gov/${index}`,
    }));
    expect(assessClaimCoverage(sources, [])).toMatchObject({
      coverage: "Limited",
      directClaimSupportCount: 0,
    });
  });

  it("requires direct claim support, reliable sources, and independent domains for sufficient coverage", () => {
    const sources = [0, 1, 2, 3].map((index) => ({
      ...source,
      sourceId: `SRC-00${index + 1}`,
      domain: `official-${index % 3}.gov`,
      url: `https://official-${index % 3}.gov/${index}`,
    }));
    const claims = [0, 1, 2].map((index) => normalizeClaim({
      claimId: `CLM-00${index + 1}`,
      claimText: `Supported claim ${index + 1}`,
      reportSection: "Market",
      provenance: "Cited source",
      supportingSourceIds: [sources[index].sourceId, ...(index === 2 ? [sources[3].sourceId] : [])],
      conflictingSourceIds: [],
    }));
    expect(assessClaimCoverage(sources, claims)).toMatchObject({
      coverage: "Sufficient",
      directClaimSupportCount: 3,
      independentReliableDomains: 3,
    });
  });
});

describe("internal-project compatibility evidence", () => {
  it("uses cost-avoidance and adoption language instead of commercial unit economics", () => {
    const scoreRows = deriveScoreExplanation(demoReport, demoInputs);
    const claims = deriveClaimEvidenceMap(demoReport, demoInputs);
    const assumptions = deriveAssumptionRegister(demoReport, demoInputs);
    const consumerText = JSON.stringify({ scoreRows, claims, assumptions });

    expect(consumerText).toMatch(/cost avoidance|financial benefit|adoption|payback/i);
    expect(consumerText).not.toMatch(/\bCAC\b|LTV:CAC|subscriber|customer acquisition|logo churn/i);
  });
});
