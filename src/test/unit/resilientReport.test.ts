import { describe, expect, it } from "vitest";
import { buildCanonicalReport } from "../../../supabase/functions/_shared/analysis/canonical";
import { buildBaseReportFromSeed } from "../../../supabase/functions/_shared/analysis/reportSeed";
import { buildResilientReportSeed } from "../../../supabase/functions/_shared/analysis/resilientSeed";

const inputs = {
  projectName: "Retail analytics platform",
  industry: "Retail",
  location: "Riyadh, Saudi Arabia",
  description: "An analytics platform that helps retailers improve inventory and store performance.",
  strategicObjectives: "Improve inventory decisions and reduce stockouts.",
  businessModel: "SaaS / Subscription Software",
  revenueModel: "Recurring subscription",
  founderExperience: "Experienced retail and technology team.",
  budgetRange: "SAR 500,000 – 1,000,000",
  timeline: "6 – 12 months",
  teamSize: "6 – 15",
  dependencies: "Retail data integrations and customer pilots.",
  assumptions: "Customers will share sufficient data for pilot validation.",
  constraints: "Privacy, integration, and procurement constraints.",
  successFactors: "Three successful pilots and measurable stockout reduction.",
  knownRisks: "Data security breaches, integration delays, customer adoption",
  regulatoryConsiderations: "Saudi PDPL and secure data handling.",
  technologyReadiness: "Established / Widely Used",
  competitorUrls: "",
};

const limitedResearch = {
  generatedAt: "2026-07-19T00:00:00.000Z",
  reliableExternalEvidence: false,
  coverage: "Limited",
  coverageMetrics: {
    reliableSourceCount: 0,
    independentReliableDomains: 0,
    currentSourceCount: 0,
    directClaimSupportCount: 0,
  },
  citations: [],
  competitorScrapes: [],
  redditSignals: [],
  webSignals: [],
};

describe("resilient report generation", () => {
  it("creates a complete conservative seed when the AI response is missing", () => {
    const result = buildResilientReportSeed({
      inputs,
      publicResearch: limitedResearch,
      aiSeed: null,
      degradedReason: "structured_output_truncated",
    });

    expect(result.usedFallback).toBe(true);
    expect(result.warningCode).toBe("generation_structured_output_truncated");
    expect(result.seed.competitors).toHaveLength(3);
    expect(result.seed.risks).toHaveLength(5);
    expect(result.seed.funding).toHaveLength(3);
    expect(result.seed.recommendations).toHaveLength(5);
    expect(result.seed.nextSteps).toHaveLength(4);

    const market = result.seed.market as Record<string, unknown>;
    expect(market.tamValue).toBe(0);
    expect(market.samValue).toBe(0);
    expect(market.somValue).toBe(0);
  });

  it("produces a canonical report with warnings instead of rejecting missing evidence", () => {
    const resilient = buildResilientReportSeed({
      inputs,
      publicResearch: limitedResearch,
      degradedReason: "structured_output_invalid",
    });
    const base = buildBaseReportFromSeed({
      seed: resilient.seed,
      inputs,
      publicResearch: limitedResearch,
      inputIssues: [],
    });
    const canonical = buildCanonicalReport(base, inputs, {
      modelId: "google/gemini-3.5-flash",
      promptVersion: "test-resilient",
      inputHash: `sha256:${"a".repeat(64)}`,
      generationTimestamp: "2026-07-19T00:00:00.000Z",
      researchTimestamp: "2026-07-19T00:00:00.000Z",
      serverInputClassification: "complete",
      inputWarningCodes: [resilient.warningCode!, "limited_external_evidence"],
    });

    expect(canonical.validationStatus).toBe("valid_with_warnings");
    expect(canonical.qualityMetadata.validationWarnings).toContain("generation_structured_output_invalid");
    expect(canonical.qualityMetadata.validationWarnings).toContain("limited_external_evidence");
    expect(canonical.scores.overall).toBeGreaterThanOrEqual(0);
    expect(canonical.scores.overall).toBeLessThanOrEqual(10);
    expect(canonical.risks).toHaveLength(5);
    expect(canonical.financials.scenarios).toHaveLength(3);
  });

  it("keeps valid AI fields while filling missing sections deterministically", () => {
    const result = buildResilientReportSeed({
      inputs,
      publicResearch: limitedResearch,
      aiSeed: {
        executiveSummary: "AI-provided summary retained.",
        recommendations: ["AI recommendation"],
      },
    });

    expect(result.usedFallback).toBe(false);
    expect(result.seed.executiveSummary).toBe("AI-provided summary retained.");
    expect(result.seed.recommendations).toEqual(["AI recommendation"]);
    expect(result.seed.risks).toHaveLength(5);
  });
});
