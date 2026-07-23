import { demoInputs, demoReport } from "@/data/demoReport";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export const canonicalInputsFixture: ConceptInputs = structuredClone(demoInputs);
export const canonicalReportFixture: FeasibilityReport = structuredClone(demoReport);

/**
 * Minimal, de-identified representation of the legacy shape confirmed in the
 * affected CAI-2026-00000094 row. It intentionally keeps the incompatible
 * snake_case keys that caused the report route to fail.
 */
export const legacyThermoFlowExternalPayload = {
  title: "ThermoFlow DC",
  industry: "infrastructure",
  inputs: {
    overview: "District cooling feasibility analysis.",
    scope: "Assess a phased cooling network.",
    assumptions: ["Phased deployment", "Existing utility corridors"],
    risks: ["Demand ramp uncertainty"],
    budget: "Not supplied",
    timeline: "24 months",
    region: "GCC",
  },
  analysis: {
    schema_version: "external_agent.v1",
    source_mode: "external_agent",
    executive_summary: "ThermoFlow is feasible subject to demand validation.",
    fmarto_scores: {
      feasibility: 72,
      market: 68,
      architecture: 75,
      risk: 61,
      timeline: 70,
      operations: 66,
      rationale: {
        feasibility: "Provided engineering concept is plausible.",
        market: "Demand requires confirmation.",
        architecture: "Conventional district-cooling design.",
        risk: "Offtake is the main uncertainty.",
        timeline: "Phased build is achievable.",
        operations: "Specialist operator required.",
      },
    },
    verdict: {
      recommendation: "proceed_with_caution",
      confidence: 0.74,
      summary: "Validate anchor demand before committing capital.",
    },
    market: {
      tam: "Not supplied",
      sam: "Not supplied",
      som: "Not supplied",
      cagr: "",
      currency: "USD",
      competitors: [
        {
          name: "Incumbent utility",
          category: "Utility concession",
          strengths: "Installed base and customer relationships",
          gap_or_opening: "Phased modular delivery",
        },
      ],
    },
    financials: {
      currency: "USD",
      capex: [
        { item: "Plant and network", amount: 1_250_000, currency: "USD" },
        { item: "Total CapEx", amount: 1_250_000, currency: "USD" },
      ],
      opex: [
        { item: "Operations year 1", year: 1, amount: 180_000, currency: "USD" },
        { item: "Total OPEX", year: 1, amount: 180_000, currency: "USD" },
        { item: "Year 2 planning envelope", year: 2, amount: 240_000, currency: "USD" },
      ],
      scenarios: [
        {
          name: "base",
          year_3_revenue: 2_400_000,
          estimated_cumulative_cash_break_even: "Month 40–46",
        },
      ],
    },
    risks: [
      {
        title: "Anchor demand is not contracted",
        severity: "high",
        likelihood: "medium",
        mitigation: "Secure conditional offtake agreements.",
      },
    ],
    funding_mix: [],
    funding_advisory: "",
    recommendations: ["Validate demand before final investment approval."],
    next_steps: ["Commission an independent demand study."],
    claims: [
      {
        id: "C01",
        text: "A cited market signal supports demand validation.",
        confidence: "high",
        sources: [
          {
            title: "Official market source",
            url: "https://example.gov/research",
            domain: "example.gov",
          },
        ],
      },
    ],
    evidence_warnings: ["Market and financial forecasts were not supplied."],
  },
  agent_metadata: {
    model: "external-agent",
    notes: "Legacy external-agent fixture",
  },
} as const;

export const repairedThermoFlowRowFixture = {
  id: "abe31755-972d-4b8b-86e3-62657db46f1d",
  display_id: "CAI-2026-00000094",
  slug: "63873c41fb1a058bc5f3a2b2f5477cc3",
  source_mode: "external_agent",
  is_public: false,
};
