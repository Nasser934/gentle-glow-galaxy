import {
  CANONICAL_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
} from "../reportContract";
import { EXTERNAL_ANALYSIS_SCHEMA } from "./shared";

/**
 * The full, self-describing submission contract handed to external assistants
 * (ChatGPT / Claude / Gemini / other agents) before they submit analysis.
 */
export const VALID_SUBMISSION_EXAMPLE = {
  schema_version: SOURCE_SCHEMA_VERSION,
  title: "Riyadh Data Center Advisory Consultancy",
  industry: "Information Technology",
  inputs: {
    projectName: "Riyadh Data Center Advisory Consultancy",
    industry: "Information Technology",
    location: "Riyadh, Saudi Arabia",
    description: "Owner-side advisory for data-center investors and operators.",
    strategicObjectives: "Win two anchor framework agreements in year one.",
    businessModel: "Professional Services",
    revenueModel: "Project / milestone billing",
    founderExperience: "",
    budgetRange: "SAR 4,500,000 – 7,500,000",
    timeline: "12 months",
    teamSize: "6 – 15",
    dependencies: "Saudi Council of Engineers licensing pathway.",
    assumptions: "Riyadh HQ; asset-light associate network.",
    constraints: "No stamped engineering design until licensed.",
    successFactors: "One anchor client converted to a framework agreement.",
    knownRisks: "Licensing, long sales cycles, specialist scarcity.",
    regulatoryConsiderations: "Saudi Council of Engineers registration required.",
    technologyReadiness: "Proven / Mature",
    competitorUrls: "",
  },
  analysis: {
    executiveSummary: "Viable advisory concept subject to licensing and anchor-client validation.",
    scores: {
      financial: 6.2,
      market: 7.4,
      achievability: 6.8,
      risk: 5.5,
      timing: 7.0,
      operational: 6.1,
      rationale: {
        financial: "Planning-grade cost model only.",
        market: "Strong announced capacity pipeline.",
        achievability: "Asset-light model is deliverable.",
        risk: "Licensing and liability exposure.",
        timing: "Demand is building now.",
        operational: "Depends on associate network depth.",
      },
    },
    market: {
      tamLabel: "Saudi data-center advisory spend",
      tamValue: "",
      tamCagr: "",
      samLabel: "",
      samValue: "",
      samCagr: "",
      somLabel: "",
      somValue: "",
      somCagr: "",
      growthChart: [],
      currency: "SAR",
    },
    financials: {
      currency: "SAR",
      capEx: [
        { category: "Systems & tooling", low: 250000, high: 400000, notes: "Planning assumption" },
      ],
      opEx: [{ category: "Core salaries", monthly: 350000, annual: 4200000 }],
      scenarios: [
        {
          scenario: "Base Case",
          probability: "50%",
          subscribersYr1: "4 engagements",
          annualRevenue: "SAR 6,000,000",
          breakEven: "Month 16",
        },
      ],
      investmentRange: "SAR 4,500,000 – 7,500,000",
      breakEvenSummary: "Month 14 – 18",
    },
    risks: [
      {
        name: "Engineering licensing scope",
        probability: "Med",
        impact: "High",
        level: "High",
        mitigation: "Obtain formal legal guidance before offering regulated services.",
      },
    ],
    competitors: [],
    recommendations: ["Secure the licensing pathway before signing regulated scope."],
    next_steps: ["Obtain written Saudi Council of Engineers guidance."],
    claims: [
      {
        text: "Saudi Arabia announced multi-gigawatt data-center investment programmes.",
        confidence: "High",
        sources: [{ title: "Official announcement", url: "https://example.gov.sa/news", source: "example.gov.sa" }],
      },
    ],
    evidence_warnings: ["No licensed market dataset was used; TAM/SAM/CAGR are intentionally empty."],
  },
  agent_metadata: { model: "external-assistant", model_version: "2026-07" },
} as const;

export const INVALID_SUBMISSION_EXAMPLE = {
  payload: {
    title: "Some Project",
    inputs: { region: "Riyadh", budget: 4500000 },
    output: {
      fmarto_scores: { financial: "high", market: 7 },
      financials: { scenarios: [{ scenario: "base", revenue: "6m" }] },
    },
  },
  why_invalid: [
    "`output` must be named `analysis`; `output` is only accepted as a legacy alias and should not be used for new submissions.",
    "`fmarto_scores.financial` is the string \"high\"; every FMART-O dimension must be a number from 0 to 10.",
    "Score dimensions achievability, risk, timing and operational are missing — all six are required.",
    "`analysis.executiveSummary` is missing.",
    "`financials.scenarios[0].scenario` must be exactly Optimistic, Base Case or Pessimistic.",
    "Prose written outside the JSON object is rejected — send JSON only.",
  ],
} as const;

export const SUBMISSION_FIELD_RULES = {
  never_infer: [
    "founderExperience",
    "regulatoryConsiderations",
    "market.tamValue / samValue / somValue / any CAGR",
    "market.growthChart points",
    "financials.scenarios[].probability and subscribersYr1",
    "fundingMix",
    "customer profile fields",
    "citation URLs",
  ],
  optional_sections: [
    "analysis.customer",
    "analysis.competitors",
    "analysis.fundingMix",
    "analysis.research",
    "analysis.claims",
    "analysis.market growth points",
  ],
  numbers:
    "Send raw numbers (not formatted strings) for capEx.low/high, opEx.monthly/annual and growthChart tam/sam. Score dimensions are numbers 0–10. Display-only fields (investmentRange, annualRevenue, probability, breakEvenSummary) are strings.",
  currency: "Use SAR for this workspace unless another currency is explicitly provided in the inputs. Set financials.currency and market.currency to the ISO code.",
  dates: "ISO 8601 (YYYY-MM-DD) for dateIssued and any date field. Never guess a date.",
  risks:
    "risks[] = { name, probability, impact, level, mitigation }. probability/impact/level must be Low | Med | High (high/medium/critical/material are normalized).",
  scenarios:
    "financials.scenarios[] = { scenario: Optimistic|Base Case|Pessimistic, probability, subscribersYr1, annualRevenue, breakEven }. Leave a field as \"\" when unknown — never invent it.",
  market:
    "market = { tamLabel, tamValue, tamCagr, samLabel, samValue, samCagr, somLabel, somValue, somCagr, growthChart[], currency }. Leave values as \"\" and growthChart as [] when no licensed dataset was used.",
  citations:
    "claims[] = { text, confidence: High|Medium|Low, sources: [{ title, url, source }] }. Preserve the original absolute http(s) URLs exactly.",
  totals:
    "Do not send capExTotal or the overall score. Concept AI recomputes capEx totals, weighted FMART-O overall and the verdict deterministically.",
} as const;

export const SUBMISSION_ENUMS = {
  "scores.verdict": ["PROCEED", "PROCEED WITH CAUTION", "REVISE", "DO NOT PROCEED"],
  "risks[].probability|impact|level": ["Low", "Med", "High"],
  "financials.scenarios[].scenario": ["Optimistic", "Base Case", "Pessimistic"],
  "research.confidence|claims[].confidence": ["High", "Medium", "Low"],
  "research.sentiment": ["Positive", "Mixed", "Negative", "Insufficient data"],
} as const;

export const SUBMISSION_RULES = [
  "Do not rename fields.",
  "Do not add unsupported field names.",
  "Do not submit prose outside the JSON object — the payload must be a single JSON object.",
  "Do not invent missing facts.",
  "Use an empty string, an empty array, or omit an optional field only where the schema allows it.",
  "Use SAR for this report unless another currency is explicitly provided.",
  "Use ISO 8601 dates.",
  "Send numeric values as numbers, not formatted strings, except where the schema requires display text.",
  "Preserve source URLs and claim-level citations exactly as found.",
  "Call validate_external_analysis on the full payload before create_external_analysis.",
  "If validation returns issues, fix each issue.path using issue.code/expected/example and resend.",
] as const;

export const SUBMISSION_CONTRACT = {
  schema_version: SOURCE_SCHEMA_VERSION,
  canonical_schema_version: CANONICAL_SCHEMA_VERSION,
  supported_report_types: ["feasibility_analysis"],
  json_schema: EXTERNAL_ANALYSIS_SCHEMA,
  required_top_level_fields: ["inputs", "analysis"],
  optional_top_level_fields: ["schema_version", "title", "industry", "agent_metadata"],
  field_rules: SUBMISSION_FIELD_RULES,
  enums: SUBMISSION_ENUMS,
  rules: SUBMISSION_RULES,
  examples: {
    valid: VALID_SUBMISSION_EXAMPLE,
    invalid: INVALID_SUBMISSION_EXAMPLE,
  },
  validation_guidance: {
    workflow: [
      "get_submission_contract",
      "build payload",
      "validate_external_analysis",
      "fix reported issues",
      "create_external_analysis (or update_external_analysis)",
    ],
    error_shape: {
      valid: false,
      issues: [{
        path: "analysis.financials.scenarios[0].probability",
        code: "missing_required_field",
        message: "Probability is required.",
        expected: "string",
        example: "35%",
      }],
    },
  },
} as const;
