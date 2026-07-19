import { describe, expect, it } from "vitest";
import { buildCanonicalReport } from "../../../supabase/functions/_shared/analysis/canonical";
import {
  buildBaseReportFromSeed,
  REPORT_SEED_SCHEMA,
} from "../../../supabase/functions/_shared/analysis/reportSeed";

const inputs = {
  projectName: "FinSight",
  industry: "Financial Services",
  location: "Riyadh, Saudi Arabia",
  description: "An AI decision-support platform for small financial advisory firms.",
  strategicObjectives: "Improve advisory quality and reduce manual analysis time.",
  businessModel: "SaaS / Subscription Software",
  revenueModel: "Recurring subscription",
  founderExperience: "The team has product, finance, and AI delivery experience.",
  budgetRange: "$250,000 – $1M",
  timeline: "6 – 12 months",
  teamSize: "6 – 15",
  dependencies: "Banking data integrations and customer consent.",
  assumptions: "Advisory firms will pay for faster evidence-aware analysis.",
  constraints: "Limited integration capacity and regulated customer data.",
  successFactors: "Accurate guidance, strong controls, and simple onboarding.",
  knownRisks: "Model error, data quality, adoption, and regulatory risk.",
  regulatoryConsiderations: "Saudi privacy and financial-sector requirements.",
  technologyReadiness: "Established / Widely Used",
  competitorUrls: "",
};

const dimensionScores = Object.fromEntries([
  "financial",
  "market",
  "achievability",
  "risk",
  "timing",
  "operational",
].map((dimension, index) => [dimension, {
  score: 6 + index * 0.2,
  confidence: 70,
  finding: `${dimension} finding`,
  rationale: `${dimension} rationale`,
}]));

const seed = {
  executiveSummary: "A concise evidence-aware summary.",
  dimensionScores,
  market: {
    currency: "SAR",
    tamLabel: "TAM",
    tamValue: 100_000_000,
    tamCagrPct: 10,
    samLabel: "SAM",
    samValue: 30_000_000,
    samCagrPct: 8,
    somLabel: "SOM",
    somValue: 3_000_000,
    somCagrPct: 6,
    assumptionNote: "Figures require direct validation.",
  },
  customer: {
    ageLocation: "Saudi advisory firms",
    income: "SME professional-services budgets",
    goals: "Faster and more consistent advice",
    willingnessToPay: "Requires validation",
    behavior: "Digital-first professional workflow",
  },
  competitors: [
    { name: "Competitor A", model: "SaaS", weakness: "Generic", edge: "Local evidence" },
    { name: "Competitor B", model: "Services", weakness: "Manual", edge: "Automation" },
    { name: "Competitor C", model: "Platform", weakness: "Complex", edge: "Simplicity" },
  ],
  research: {
    overview: "Research is partial.",
    confidence: "Medium",
    sentiment: "Mixed",
    keySignals: ["Demand signal", "Regulatory need", "Integration complexity"],
    painPoints: ["Manual work", "Data quality", "Compliance burden"],
  },
  financialPlan: {
    currency: "SAR",
    projectType: "commercial",
    capExItems: [
      { category: "Product", low: 300_000, high: 450_000, notes: "Estimate" },
      { category: "Compliance", low: 100_000, high: 150_000, notes: "Estimate" },
    ],
    opExItems: [
      { category: "Cloud", monthly: 20_000 },
      { category: "Support", monthly: 30_000 },
    ],
    scenarios: [
      { scenario: "Optimistic", probabilityPct: 20, annualValue: 2_000_000, adoptionRatePct: 70, volumeAssumption: "200 customers", breakEvenMonths: 12, basis: "Estimate" },
      { scenario: "Base Case", probabilityPct: 50, annualValue: 1_200_000, adoptionRatePct: 50, volumeAssumption: "120 customers", breakEvenMonths: 20, basis: "Estimate" },
      { scenario: "Pessimistic", probabilityPct: 30, annualValue: 500_000, adoptionRatePct: 25, volumeAssumption: "50 customers", breakEvenMonths: 36, basis: "Estimate" },
    ],
    ltvCacRatio: "3.0x estimate",
  },
  risks: [
    { name: "Data quality", probability: "High", impact: "High", level: "High", mitigation: "Validate sources and add review controls." },
    { name: "Adoption", probability: "Med", impact: "High", level: "High", mitigation: "Pilot with target users." },
    { name: "Integration", probability: "Med", impact: "Med", level: "Med", mitigation: "Use staged integrations." },
    { name: "Compliance", probability: "Med", impact: "High", level: "High", mitigation: "Complete legal review." },
    { name: "Competition", probability: "Med", impact: "Med", level: "Med", mitigation: "Differentiate on local evidence." },
  ],
  funding: [
    { source: "Founder", sharePct: 40, rationale: "Initial delivery" },
    { source: "Strategic investor", sharePct: 35, rationale: "Scale" },
    { source: "Innovation grant", sharePct: 25, rationale: "Validation" },
  ],
  fundingAdvisory: "Use staged funding.",
  recommendations: ["Validate demand", "Confirm pricing", "Complete compliance review", "Pilot integrations", "Track outcomes"],
  nextSteps: ["Interview customers", "Obtain quotations", "Run a proof of concept", "Review the evidence"],
  evidenceClaims: [
    {
      claimText: "Regulatory demand supports the concept.",
      reportSection: "Market Analysis",
      provenance: "Cited source",
      supportingSourceIds: ["SRC-1"],
      conflictingSourceIds: [],
      dimensions: ["market", "risk"],
      userCanImproveBy: "Add regulator guidance.",
    },
  ],
};

const publicResearch = {
  generatedAt: "2026-07-19T00:00:00.000Z",
  coverage: "Partial",
  reliableExternalEvidence: true,
  coverageMetrics: { reliableSourceCount: 1 },
  citations: [{
    sourceId: "SRC-1",
    title: "Regulatory source",
    publisher: "Regulator",
    url: "https://example.gov/source",
    sourceType: "Verified market evidence",
    quality: "Government or regulator",
    publicationDate: "2026-01-01",
  }],
  redditSignals: ["Community signal"],
  webSignals: ["Web signal"],
  competitorScrapes: [],
};

describe("slim report seed", () => {
  it("uses a materially smaller schema that excludes server-owned calculations", () => {
    const serialized = JSON.stringify(REPORT_SEED_SCHEMA);
    expect(serialized).toContain("dimensionScores");
    expect(serialized).not.toContain("inputQualityScore");
    expect(serialized).not.toContain("evidenceMix");
    expect(serialized).not.toContain("scoreExplanation");
    expect(serialized).not.toContain("capExMid");
    expect(serialized.length).toBeLessThan(14_000);
  });

  it("expands the seed into a mathematically consistent report shape", () => {
    const base = buildBaseReportFromSeed({
      seed,
      inputs,
      publicResearch,
      inputIssues: [],
    });

    expect(base.financials.capExTotal).toEqual({ low: 400_000, high: 600_000, mid: 500_000 });
    expect(base.financials.opEx).toEqual([
      { category: "Cloud", monthly: 20_000, annual: 240_000 },
      { category: "Support", monthly: 30_000, annual: 360_000 },
    ]);
    expect(base.financials.investmentRange).toBe("SAR 700,000–900,000");
    expect(base.market.growthChart).toHaveLength(5);
    expect(base.scoreExplanation).toHaveLength(6);
    expect(base.fundingMix.map((item: { share: string }) => item.share)).toEqual(["40%", "35%", "25%"]);
  });

  it("passes canonical scoring and financial validation without model-owned totals", () => {
    const expanded = buildBaseReportFromSeed({ seed, inputs, publicResearch, inputIssues: [] });
    const canonical = buildCanonicalReport({
      ...expanded,
      research: {
        ...expanded.research,
        citations: publicResearch.citations,
      },
    }, inputs, {
      modelId: "google/gemini-3.5-flash",
      promptVersion: "test-seed",
      inputHash: "sha256:test",
      generationTimestamp: "2026-07-19T00:00:00.000Z",
      researchTimestamp: publicResearch.generatedAt,
      serverInputClassification: "complete",
      inputWarningCodes: [],
    });

    expect(canonical.scores.overall).toBeGreaterThan(0);
    expect(canonical.scores.verdict).toBeTruthy();
    expect(canonical.qualityMetadata.financialWarningCount).toBe(0);
    expect(canonical.claims.length).toBeGreaterThanOrEqual(3);
  });
});
