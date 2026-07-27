import { describe, expect, it } from "vitest";
import {
  buildPartPrompts,
  computeDecisionReadiness,
  finalizeReportDeterministically,
  REPORT_PARTS,
  validateFinancialArithmetic,
  verdictFromScore,
} from "./analysisCore.ts";
import { ensureEvidenceFields } from "./evidence.ts";
import {
  resolvedScenarioCompleteness,
  validateResolvedConcept,
  type ResolvedConcept,
} from "./ai/schemas/resolved-concept.schema.ts";
import {
  conceptIsSpecificEnough,
  resolveConcept,
} from "./conceptResolver.ts";
import {
  ensureResearchSourceIds,
  sourceIdFromUrl,
  type ResearchState,
} from "./researchAgent.ts";

const resolvedConcept = (over: Partial<ResolvedConcept> = {}): ResolvedConcept => ({
  version: "resolved-concept.v1",
  resolutionStatus: "resolved",
  originalBriefSummary: "A broad cooling test platform concept.",
  candidateScenarios: [
    {
      id: "scenario-1",
      name: "Cooling validation lab",
      description: "A paid lab and analytics service.",
      targetCustomer: "Data-centre operators",
      targetGeography: "Saudi Arabia",
      businessModel: "Professional services",
      revenueModel: "Per test programme",
      evidenceStrength: 82,
      sourceIds: ["source-1"],
      advantages: ["Clear buyer"],
      limitations: ["Requires equipment"],
    },
  ],
  selectedBaselineScenario: {
    id: "scenario-1",
    name: "Cooling validation lab",
    description: "A paid lab and analytics service.",
    productCategory: "Engineering testing",
    customerProblem: "Cooling performance is hard to validate before deployment.",
    targetCustomer: "Data-centre operators",
    targetGeography: "Saudi Arabia",
    valueProposition: "Measured thermal and airflow evidence.",
    businessModel: "Professional services",
    revenueModel: "Per test programme",
    pricingApproach: "Benchmark-led project pricing",
    operatingModel: "Central laboratory plus on-site testing",
    technologyApproach: "Sensors, controllable loads, and analytics",
    regulatoryScope: "Electrical, safety, and facility requirements",
    costProfile: "Equipment-led CapEx and engineering OpEx",
    commercialUnit: "One paid validation programme",
    sourceIds: ["source-1", "source-2"],
  },
  selectionRationale: "Best fit with demand, budget, and technical evidence.",
  resolvedPublicFacts: [
    {
      field: "targetDemand",
      value: "Operators commission thermal validation.",
      sourceIds: ["source-1"],
      confidence: 85,
    },
  ],
  explicitAssumptions: [
    {
      field: "averageProjectPrice",
      value: "SAR 250,000",
      reason: "Public pricing was unavailable.",
      impact: "high",
    },
  ],
  unresolvedPrivateDecisions: [],
  confidence: 84,
  ...over,
});

const scoredReport = () => ({
  scores: {
    financial: 8,
    market: 8,
    achievability: 8,
    risk: 8,
    timing: 8,
    operational: 8,
    overall: 0,
    verdict: "REVISE",
    weights: {
      financial: 0.2,
      market: 0.2,
      achievability: 0.15,
      risk: 0.15,
      timing: 0.15,
      operational: 0.15,
    },
    confidence: {
      financial: 90,
      market: 90,
      achievability: 90,
      risk: 90,
      timing: 90,
      operational: 90,
    },
  },
  claimEvidenceMap: [
    { sources: ["source-1"] },
    { sources: ["source-2"] },
  ],
  resolvedConcept: resolvedConcept(),
});

describe("resolved concept contract", () => {
  it("accepts a complete resolver payload whose source IDs exist", () => {
    const value = validateResolvedConcept(
      resolvedConcept(),
      new Set(["source-1", "source-2"]),
    );
    expect(value.selectedBaselineScenario.id).toBe("scenario-1");
    expect(value.unresolvedPrivateDecisions).toEqual([]);
  });

  it("rejects a resolver source ID absent from the research snapshot", () => {
    expect(() => validateResolvedConcept(
      resolvedConcept(),
      new Set(["source-1"]),
    )).toThrow(/source-2/);
  });

  it("measures the selected scenario rather than Brief Clarity", () => {
    expect(resolvedScenarioCompleteness(resolvedConcept())).toBe(100);
    expect(resolvedScenarioCompleteness(resolvedConcept({
      selectedBaselineScenario: {
        ...resolvedConcept().selectedBaselineScenario,
        pricingApproach: "",
        operatingModel: "",
        regulatoryScope: "",
      },
    }))).toBeLessThan(100);
  });

  it("assigns stable source IDs before the resolver can cite them", () => {
    const url = "https://example.com/market?utm_source=test";
    const first = ensureResearchSourceIds([
      {
        url,
        normalizedUrl: "https://example.com/market",
        domain: "example.com",
        title: "Market",
        snippet: "Evidence",
        extractedContent: null,
        relevanceScore: 0.8,
        authorityScore: 75,
        categories: ["market_size"],
        queryIds: ["q1"],
        publishedDate: null,
        extracted: false,
      },
    ]);
    expect(first[0].id).toBe(sourceIdFromUrl("https://example.com/market"));
    expect(ensureResearchSourceIds(first)[0].id).toBe(first[0].id);
  });

  it("resolves with a mocked provider and sends governed source IDs", async () => {
    const state: ResearchState = {
      phase: "resolving",
      round: 1,
      queries: [],
      completedQueryIds: [],
      failedQueryIds: [],
      sources: ensureResearchSourceIds([
        {
          url: "https://example.com/market",
          normalizedUrl: "https://example.com/market",
          domain: "example.com",
          title: "Market evidence",
          snippet: "Market evidence for the selected customer.",
          extractedContent: null,
          relevanceScore: 0.8,
          authorityScore: 75,
          categories: ["market_size"],
          queryIds: ["q1"],
          publishedDate: "2026-01-01",
          extracted: false,
        },
      ]),
      review: {
        enough: true,
        rationale: "Enough",
        missingAreas: [],
        unsupportedClaims: [],
        additionalQueries: [],
      },
      startedAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    };
    const sourceId = state.sources[0].id;
    let systemPrompt = "";
    let userPrompt = "";
    const output = resolvedConcept({
      candidateScenarios: [
        { ...resolvedConcept().candidateScenarios[0], sourceIds: [sourceId] },
      ],
      selectedBaselineScenario: {
        ...resolvedConcept().selectedBaselineScenario,
        sourceIds: [sourceId],
      },
      resolvedPublicFacts: [
        { field: "demand", value: "Supported", sourceIds: [sourceId], confidence: 80 },
      ],
    });

    const resolved = await resolveConcept(
      {
        projectName: "Cooling lab",
        industry: "Engineering services",
        description: "A testing laboratory for data-centre cooling systems.",
      },
      state,
      {
        score: 80,
        level: "High",
        uniqueSources: 1,
        uniqueDomains: 1,
        authoritativeSources: 1,
        extractedSources: 0,
        coveredCategories: ["market_size"],
        missingCategories: [],
        averageRelevance: 0.8,
        minimumSourceTargetMet: false,
      },
      async (messages) => {
        systemPrompt = messages[0].content;
        userPrompt = messages[1].content;
        return output;
      },
    );

    expect(systemPrompt).toContain("Concept Resolver");
    expect(userPrompt).toContain(sourceId);
    expect(resolved.selectedBaselineScenario.id).toBe("scenario-1");
  });

  it("permits resolver fallback only for a materially specific brief", () => {
    expect(conceptIsSpecificEnough({
      projectName: "App",
      industry: "Technology",
      description: "An app.",
    })).toBe(false);
    expect(conceptIsSpecificEnough({
      projectName: "Cooling validation lab",
      industry: "Engineering services",
      location: "Riyadh, Saudi Arabia",
      description:
        "A commercial laboratory that validates cooling performance for data-centre operators before equipment deployment.",
      businessModel: "Professional services",
      revenueModel: "Per validation programme",
      budgetRange: "SAR 5m–10m",
      timeline: "18 months",
    })).toBe(true);
  });

  it("supplies each analyst with original input, research, baseline, and prior parts", () => {
    const marketPart = REPORT_PARTS.find((part) => part.key === "market")!;
    const prompts = buildPartPrompts(
      { projectName: "Original project", description: "Original brief" },
      { sources: [{ id: "source-1" }] },
      marketPart,
      { prior: { value: "authoritative" } },
      resolvedConcept(),
    );
    expect(prompts.systemPrompt).toContain("Market Analyst");
    expect(prompts.systemPrompt).toContain("Concept AI Product Policy");
    expect(prompts.userPrompt).toContain("Original project");
    expect(prompts.userPrompt).toContain("source-1");
    expect(prompts.userPrompt).toContain("Cooling validation lab");
    expect(prompts.userPrompt).toContain("authoritative");
  });
});

describe("authoritative feasibility and readiness", () => {
  it.each([
    [7.5, "PROCEED"],
    [6, "PROCEED WITH CAUTION"],
    [4.5, "REVISE"],
    [4.4, "DO NOT PROCEED"],
  ] as const)("maps %s to %s", (score, verdict) => {
    expect(verdictFromScore(score)).toBe(verdict);
  });

  it("keeps FMART-O unchanged when research quality changes", () => {
    const strong = finalizeReportDeterministically(scoredReport(), { score: 90 });
    const weak = finalizeReportDeterministically(scoredReport(), { score: 20 });
    expect(strong.scores.overall).toBe(8);
    expect(weak.scores.overall).toBe(8);
    expect(strong.scores.verdict).toBe("PROCEED");
    expect(weak.scores.verdict).toBe("PROCEED");
    expect(weak.scores.confidence.market).toBeLessThan(strong.scores.confidence.market);
  });

  it("rebuilds the display decision from the finalized FMART-O result", () => {
    const report = {
      ...scoredReport(),
      decision: {
        verdict: "REVISE",
        recommendationLabel: "Revise",
        nextStepHint: "Old pre-finalization summary.",
        blockers: [],
        overallConfidencePct: 10,
      },
    };
    const finalized = finalizeReportDeterministically(report, { score: 90 });

    expect(finalized.scores.verdict).toBe("PROCEED");
    expect(finalized.decision.verdict).toBe("PROCEED");
    expect(finalized.decision.overallConfidencePct).toBe(90);
  });

  it("removes claim citations absent from the saved research snapshot", () => {
    const report = {
      ...scoredReport(),
      research: {
        citations: [{ id: "source-1", url: "https://example.com" }],
      },
      claimEvidenceMap: [
        { sources: ["source-1", "invented-source"] },
      ],
    };
    const finalized = finalizeReportDeterministically(report, { score: 80 });
    expect(finalized.claimEvidenceMap[0].sources).toEqual(["source-1"]);
  });

  it("does not use Brief Clarity in readiness", () => {
    const lowBrief = { ...scoredReport(), inputQualityScore: 10 };
    const highBrief = { ...scoredReport(), inputQualityScore: 100 };
    expect(computeDecisionReadiness(lowBrief, 80)).toEqual(
      computeDecisionReadiness(highBrief, 80),
    );
  });

  it("penalizes unresolved high-impact private decisions only", () => {
    const base = scoredReport();
    const withPrivateDecision = {
      ...base,
      resolvedConcept: resolvedConcept({
        unresolvedPrivateDecisions: [
          {
            field: "supplierQuote",
            reason: "Private quotation not supplied.",
            decisionImpact: "high",
            userAction: "Obtain two supplier quotations.",
          },
        ],
      }),
    };
    expect(
      computeDecisionReadiness(withPrivateDecision, 80).decisionReadinessScore,
    ).toBeLessThan(
      computeDecisionReadiness(base, 80).decisionReadinessScore,
    );
  });

  it("evidence enrichment never rewrites the FMART-O verdict", () => {
    const report = {
      ...scoredReport(),
      scores: { ...scoredReport().scores, overall: 8, verdict: "PROCEED" },
    };
    const enriched = ensureEvidenceFields(report, {
      projectName: "Test",
      industry: "Infrastructure",
      description: "Short",
    });
    expect(enriched.scores.verdict).toBe("PROCEED");
  });

  it("validates financial totals, annual OpEx, currency, and market hierarchy", () => {
    const valid = {
      market: {
        currency: "SAR",
        tamValue: "SAR 10B",
        samValue: "SAR 2B",
        somValue: "SAR 300M",
      },
      financials: {
        currency: "SAR",
        capExLow: 300,
        capExHigh: 500,
        capExMid: 400,
        capEx: [
          { low: 100, high: 200 },
          { low: 200, high: 300 },
        ],
        opEx: [{ monthly: 10, annual: 120 }],
      },
    };
    expect(() => validateFinancialArithmetic(valid)).not.toThrow();
    expect(() => validateFinancialArithmetic({
      ...valid,
      financials: { ...valid.financials, capExLow: 301 },
    })).toThrow(/CapEx low total/);
    expect(() => validateFinancialArithmetic({
      ...valid,
      financials: {
        ...valid.financials,
        opEx: [{ monthly: 10, annual: 100 }],
      },
    })).toThrow(/annual OpEx/);
    expect(() => validateFinancialArithmetic({
      ...valid,
      market: { ...valid.market, currency: "USD" },
    })).toThrow(/currency/);
    expect(() => validateFinancialArithmetic({
      ...valid,
      market: {
        ...valid.market,
        samValue: "SAR 20B",
      },
    })).toThrow(/TAM.*SAM.*SOM/);
  });
});
