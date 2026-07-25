import { z } from "zod";
import type {
  ConceptInputs,
  FeasibilityReport,
  FMARTScores,
  RevenueScenario,
} from "@/types/analysis";

const scoreDimensions = [
  "financial",
  "market",
  "achievability",
  "risk",
  "timing",
  "operational",
] as const;

type ScoreDimension = (typeof scoreDimensions)[number];
type UnknownRecord = Record<string, unknown>;

const nonEmptyString = z.string().trim().min(1);
const requiredString = z.string();
const scoreNumber = z.number().finite().min(0).max(10);
const nonNegativeNumber = z.number().finite().min(0);

export const isSafeExternalHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const externalHttpUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isSafeExternalHttpUrl(value),
    "must be empty or an absolute HTTP(S) URL",
  );

const scoreDimensionRecordSchema = z.object({
  financial: z.number().finite(),
  market: z.number().finite(),
  achievability: z.number().finite(),
  risk: z.number().finite(),
  timing: z.number().finite(),
  operational: z.number().finite(),
});

export const conceptInputsSchema = z.object({
  projectName: requiredString,
  industry: requiredString,
  location: requiredString,
  description: requiredString,
  strategicObjectives: requiredString,
  businessModel: requiredString,
  revenueModel: requiredString,
  founderExperience: requiredString,
  budgetRange: requiredString,
  timeline: requiredString,
  teamSize: requiredString,
  dependencies: requiredString,
  assumptions: requiredString,
  constraints: requiredString,
  successFactors: requiredString,
  knownRisks: requiredString,
  regulatoryConsiderations: requiredString,
  technologyReadiness: requiredString,
  competitorUrls: requiredString,
}).strict();

const fmartoScoresSchema = z.object({
  financial: scoreNumber,
  market: scoreNumber,
  achievability: scoreNumber,
  risk: scoreNumber,
  timing: scoreNumber,
  operational: scoreNumber,
  overall: scoreNumber,
  verdict: z.enum(["PROCEED", "PROCEED WITH CAUTION", "REVISE", "DO NOT PROCEED"]),
  financialFinding: requiredString,
  marketFinding: requiredString,
  achievabilityFinding: requiredString,
  riskFinding: requiredString,
  timingFinding: requiredString,
  operationalFinding: requiredString,
  weights: scoreDimensionRecordSchema
    .refine(
      (weights) => scoreDimensions.every((dimension) => weights[dimension] >= 0),
      "weights cannot be negative",
    )
    .optional(),
  confidence: scoreDimensionRecordSchema
    .refine(
      (confidence) => scoreDimensions.every((dimension) => (
        confidence[dimension] >= 0 && confidence[dimension] <= 100
      )),
      "confidence values must be between 0 and 100",
    )
    .optional(),
  rationale: z.object({
    financial: requiredString,
    market: requiredString,
    achievability: requiredString,
    risk: requiredString,
    timing: requiredString,
    operational: requiredString,
  }).optional(),
});

const marketSchema = z.object({
  tamLabel: requiredString,
  tamValue: requiredString,
  tamCagr: requiredString,
  samLabel: requiredString,
  samValue: requiredString,
  samCagr: requiredString,
  somLabel: requiredString,
  somValue: requiredString,
  somCagr: requiredString,
  growthChart: z.array(z.object({
    year: requiredString,
    tam: nonNegativeNumber,
    sam: nonNegativeNumber,
  })),
  currency: requiredString,
});

const customerSchema = z.object({
  ageLocation: requiredString,
  income: requiredString,
  goals: requiredString,
  willingnessToPay: requiredString,
  behavior: requiredString,
});

const competitorSchema = z.object({
  name: requiredString,
  model: requiredString,
  weakness: requiredString,
  edge: requiredString,
});

const financialsSchema = z.object({
  currency: requiredString,
  capExTotal: z.object({
    low: nonNegativeNumber,
    high: nonNegativeNumber,
    mid: nonNegativeNumber,
  }),
  capEx: z.array(z.object({
    category: requiredString,
    low: nonNegativeNumber,
    high: nonNegativeNumber,
    notes: requiredString,
  })),
  opEx: z.array(z.object({
    category: requiredString,
    monthly: nonNegativeNumber,
    annual: nonNegativeNumber,
  })),
  scenarios: z.array(z.object({
    scenario: z.enum(["Optimistic", "Base Case", "Pessimistic"]),
    probability: requiredString,
    subscribersYr1: requiredString,
    annualRevenue: requiredString,
    breakEven: requiredString,
  })),
  investmentRange: requiredString,
  breakEvenSummary: requiredString,
  ltvCacRatio: requiredString.optional(),
});

const riskSchema = z.object({
  name: requiredString,
  probability: z.enum(["Low", "Med", "High"]),
  impact: z.enum(["Low", "Med", "High"]),
  level: z.enum(["Low", "Med", "High"]),
  mitigation: requiredString,
});

const fundingSourceSchema = z.object({
  source: requiredString,
  share: requiredString,
  amount: requiredString,
  rationale: requiredString,
});

const researchSchema = z.object({
  overview: requiredString,
  confidence: z.enum(["High", "Medium", "Low"]),
  sentiment: z.enum(["Positive", "Mixed", "Negative", "Insufficient data"]),
  keySignals: z.array(requiredString),
  painPoints: z.array(requiredString),
  competitorMentions: z.array(requiredString),
  redditSignals: z.array(requiredString),
  webSignals: z.array(requiredString),
  citations: z.array(z.object({
    title: requiredString,
    url: externalHttpUrlSchema,
    source: requiredString,
    takeaway: requiredString,
  })),
});

const inputCompletenessSchema = z.object({
  overall: z.number().finite().min(0).max(100),
  missingFields: z.array(requiredString),
  weakFields: z.array(requiredString),
  contradictoryFields: z.array(requiredString),
});

const evidenceMixSchema = z.object({
  userInputPercent: z.number().finite().min(0).max(100),
  webResearchPercent: z.number().finite().min(0).max(100),
  aiAssumptionPercent: z.number().finite().min(0).max(100),
});

const scoreExplanationSchema = z.object({
  dimension: z.enum(scoreDimensions),
  label: requiredString,
  score: scoreNumber,
  positiveDrivers: z.array(requiredString),
  negativeDrivers: z.array(requiredString),
  missingEvidence: z.array(requiredString),
  improvementActions: z.array(requiredString),
  decisionImplication: requiredString,
});

const claimEvidenceSchema = z.object({
  claimId: requiredString,
  claimText: requiredString,
  reportSection: requiredString,
  userInputPercent: z.number().finite().min(0).max(100),
  webResearchPercent: z.number().finite().min(0).max(100),
  aiAssumptionPercent: z.number().finite().min(0).max(100),
  confidence: z.enum(["High", "Medium", "Low"]),
  sources: z.array(requiredString),
  userCanImproveBy: requiredString,
});

const reportVersionSchema = z.object({
  versionId: requiredString,
  createdAt: requiredString,
  changedInputs: z.array(requiredString),
  previousScore: z.number().finite(),
  newScore: z.number().finite(),
  scoreDelta: z.number().finite(),
  previousConfidence: z.number().finite(),
  newConfidence: z.number().finite(),
  confidenceDelta: z.number().finite(),
  previousAiAssumptionPercent: z.number().finite(),
  newAiAssumptionPercent: z.number().finite(),
  summary: requiredString,
});

const decisionSchema = z.object({
  verdict: z.enum([
    "PROCEED",
    "CONDITIONAL PROCEED",
    "CONDITIONAL PROCEED WITH VALIDATION",
    "IMPROVE INPUTS BEFORE INVESTMENT DECISION",
    "REVISE",
    "DO NOT PROCEED",
  ]),
  recommendationLabel: requiredString,
  nextStepHint: requiredString,
  blockers: z.array(requiredString),
  overallConfidencePct: z.number().finite().min(0).max(100),
});

/**
 * Canonical structure consumed by report routes, evidence enrichment, and all
 * exporters. External-agent source metadata belongs on the reports row, not in
 * this object.
 */
export const feasibilityReportSchema = z.object({
  reportId: nonEmptyString,
  dateIssued: nonEmptyString,
  classification: requiredString,
  preparedBy: requiredString,
  methodology: requiredString,
  executiveSummary: nonEmptyString,
  scores: fmartoScoresSchema,
  market: marketSchema,
  customer: customerSchema,
  competitors: z.array(competitorSchema),
  research: researchSchema.optional(),
  financials: financialsSchema,
  risks: z.array(riskSchema),
  fundingMix: z.array(fundingSourceSchema),
  fundingAdvisory: requiredString,
  recommendations: z.array(requiredString),
  nextSteps: z.array(requiredString),
  evidenceWarnings: z.array(requiredString).optional(),
  inputQualityScore: z.number().finite().min(0).max(100).optional(),
  inputCompleteness: inputCompletenessSchema.optional(),
  evidenceMix: evidenceMixSchema.optional(),
  scoreExplanation: z.array(scoreExplanationSchema).optional(),
  claimEvidenceMap: z.array(claimEvidenceSchema).optional(),
  reportVersions: z.array(reportVersionSchema).optional(),
  decision: decisionSchema.optional(),
  legacyEvidence: z.boolean().optional(),
}).passthrough();

/** Schema versions exchanged with external assistants and stored on reports. */
export const SOURCE_SCHEMA_VERSION = "external_agent.v1";
export const CANONICAL_SCHEMA_VERSION = "canonical_report.v2";

export interface ReportValidationIssue {
  path: string;
  message: string;
  /** Machine-readable reason so an assistant can self-correct and resend. */
  code?: string;
  /** Expected type/shape, e.g. "number", "string", "array<object>". */
  expected?: string;
  /** A concrete valid example value for this path. */
  example?: unknown;
}


export type CanonicalValidationResult =
  | {
      valid: true;
      issues: [];
      inputs: ConceptInputs;
      output: FeasibilityReport;
    }
  | {
      valid: false;
      issues: ReportValidationIssue[];
    };

export type ExternalNormalizationResult =
  | {
      valid: true;
      issues: [];
      inputs: ConceptInputs;
      output: FeasibilityReport;
      warnings: string[];
    }
  | {
      valid: false;
      issues: ReportValidationIssue[];
    };

export interface ExternalNormalizationOptions {
  reportId?: string;
  dateIssued?: string;
}

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const record = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const valueAt = (source: UnknownRecord, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const text = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n");
  return "";
};

const stringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return text(item);
      const itemRecord = record(item);
      const primary = text(valueAt(
        itemRecord,
        "text",
        "title",
        "name",
        "action",
        "step",
        "recommendation",
        "signal",
        "purpose",
        "description",
      ));
      const implication = text(itemRecord.implication);
      return primary && implication ? `${primary} — ${implication}` : primary;
    })
    .filter(Boolean);
};

const objectArrayLines = (
  value: unknown,
  primaryKeys: string[],
  secondaryKeys: string[] = [],
): string => {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const row = record(item);
    const primary = text(valueAt(row, ...primaryKeys));
    const secondary = text(valueAt(row, ...secondaryKeys));
    if (primary && secondary) return `${primary}: ${secondary}`;
    return primary || secondary;
  }).filter(Boolean).join("\n");
};

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!normalized) return undefined;
  const parsed = Number(normalized[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const titleCaseLevel = (value: unknown): "Low" | "Med" | "High" => {
  const normalized = text(value).toLowerCase();
  if (normalized === "high" || normalized === "critical" || normalized === "severe") return "High";
  if (
    normalized === "med"
    || normalized === "medium"
    || normalized === "material"
    || normalized === "moderate"
  ) return "Med";
  return "Low";
};

const scenarioName = (value: unknown): RevenueScenario["scenario"] => {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("optim") || normalized.includes("upside") || normalized.includes("best")) {
    return "Optimistic";
  }
  if (normalized.includes("pess") || normalized.includes("downside") || normalized.includes("worst")) {
    return "Pessimistic";
  }
  return "Base Case";
};

const zodIssues = (prefix: string, error: z.ZodError): ReportValidationIssue[] => (
  error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }))
);

export function validateCanonicalReportData(
  inputs: unknown,
  output: unknown,
): CanonicalValidationResult {
  const inputResult = conceptInputsSchema.safeParse(inputs);
  const outputResult = feasibilityReportSchema.safeParse(output);
  const issues: ReportValidationIssue[] = [];

  if (!inputResult.success) issues.push(...zodIssues("inputs", inputResult.error));
  if (!outputResult.success) issues.push(...zodIssues("output", outputResult.error));

  if (issues.length > 0 || !inputResult.success || !outputResult.success) {
    return { valid: false, issues };
  }

  return {
    valid: true,
    issues: [],
    inputs: inputResult.data as ConceptInputs,
    output: outputResult.data as FeasibilityReport,
  };
}

export function assertCanonicalReportData(
  inputs: unknown,
  output: unknown,
): { inputs: ConceptInputs; output: FeasibilityReport } {
  const result = validateCanonicalReportData(inputs, output);
  if (!result.valid) {
    const details = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new Error(`Report data is incompatible. ${details}`);
  }
  return { inputs: result.inputs, output: result.output };
}

const normalizeInputs = (payload: UnknownRecord): ConceptInputs => {
  const candidate = record(payload.inputs);
  const canonical = conceptInputsSchema.safeParse(candidate);
  if (canonical.success) return canonical.data as ConceptInputs;

  const overview = record(candidate.overview);
  const scope = record(candidate.scope);
  const operatingModel = record(valueAt(candidate, "operatingModel", "operating_model"));
  const businessModelRows = valueAt(candidate, "businessModel", "business_model");
  return {
    projectName: text(valueAt(candidate, "projectName", "project_name", "working_name", "title", "name"))
      || text(valueAt(overview, "projectName", "project_name", "title", "name"))
      || text(payload.title),
    industry: text(valueAt(candidate, "industry", "sector"))
      || text(valueAt(overview, "industry", "sector"))
      || text(payload.industry),
    location: text(valueAt(candidate, "location", "region", "geography"))
      || text(valueAt(overview, "location", "region", "geography")),
    description: text(valueAt(candidate, "description", "overview", "summary"))
      || text(valueAt(overview, "description", "summary"))
      || text(valueAt(scope, "description", "summary")),
    strategicObjectives: text(valueAt(candidate, "strategicObjectives", "strategic_objectives", "objectives"))
      || text(valueAt(overview, "strategicObjectives", "strategic_objectives", "objectives"))
      || text(valueAt(candidate, "value_proposition")),
    businessModel: text(businessModelRows)
      || objectArrayLines(businessModelRows, ["offer", "name"], ["pricing_assumption"]),
    revenueModel: text(valueAt(candidate, "revenueModel", "revenue_model"))
      || objectArrayLines(businessModelRows, ["offer", "name"], ["pricing_assumption"]),
    founderExperience: text(valueAt(candidate, "founderExperience", "founder_experience", "sponsor_experience")),
    budgetRange: text(valueAt(candidate, "budgetRange", "budget_range", "budget")),
    timeline: text(valueAt(candidate, "timeline", "schedule")),
    teamSize: text(valueAt(candidate, "teamSize", "team_size", "resources"))
      || text(valueAt(operatingModel, "core_team", "coreTeam")),
    dependencies: text(valueAt(candidate, "dependencies"))
      || text(valueAt(scope, "dependencies"))
      || text(valueAt(operatingModel, "partners")),
    assumptions: text(valueAt(candidate, "assumptions")),
    constraints: text(valueAt(candidate, "constraints", "exclusions"))
      || text(valueAt(scope, "constraints")),
    successFactors: text(valueAt(
      candidate,
      "successFactors",
      "success_factors",
      "success_criteria",
      "success_metrics",
    )),
    knownRisks: text(valueAt(candidate, "knownRisks", "known_risks", "risks")),
    regulatoryConsiderations: text(
      valueAt(
        candidate,
        "regulatoryConsiderations",
        "regulatory_considerations",
        "regulatory",
        "standards_and_methods",
      ),
    ),
    technologyReadiness: text(
      valueAt(candidate, "technologyReadiness", "technology_readiness", "technical_readiness"),
    ),
    competitorUrls: text(valueAt(candidate, "competitorUrls", "competitor_urls")),
  };
};

const normalizeWeights = (source: UnknownRecord): Record<ScoreDimension, number> => {
  const supplied = scoreDimensions.map((dimension) => numberValue(source[dimension]));
  if (supplied.every((value) => value !== undefined && value >= 0)) {
    const total = supplied.reduce((sum, value) => sum + (value ?? 0), 0);
    if (total > 0) {
      return Object.fromEntries(
        scoreDimensions.map((dimension, index) => [dimension, (supplied[index] ?? 0) / total]),
      ) as Record<ScoreDimension, number>;
    }
  }
  return {
    financial: 1 / 6,
    market: 1 / 6,
    achievability: 1 / 6,
    risk: 1 / 6,
    timing: 1 / 6,
    operational: 1 / 6,
  };
};

const verdictForScore = (overall: number): FMARTScores["verdict"] => {
  if (overall >= 7.5) return "PROCEED";
  if (overall >= 6) return "PROCEED WITH CAUTION";
  if (overall >= 4.5) return "REVISE";
  return "DO NOT PROCEED";
};

const normalizeScores = (
  analysis: UnknownRecord,
): { scores?: FMARTScores; issues: ReportValidationIssue[] } => {
  const source = record(
    valueAt(analysis, "scores", "fmarto_scores", "fmartoScores", "fmarto"),
  );
  if (Object.keys(source).length === 0) {
    return {
      issues: [{
        path: "analysis.scores",
        message: "scores (or legacy fmarto_scores/fmarto) are required",
      }],
    };
  }

  const aliases: Record<ScoreDimension, string[]> = {
    financial: ["financial", "feasibility"],
    market: ["market"],
    achievability: ["achievability", "architecture", "technical"],
    risk: ["risk"],
    timing: ["timing", "timeline"],
    operational: ["operational", "operations"],
  };
  const rawScores = {} as Record<ScoreDimension, number>;
  const issues: ReportValidationIssue[] = [];

  for (const dimension of scoreDimensions) {
    const rawValue = numberValue(valueAt(source, ...aliases[dimension]));
    if (rawValue === undefined || rawValue < 0 || rawValue > 100) {
      issues.push({
        path: `analysis.scores.${dimension}`,
        message: "must resolve to a number between 0 and 100",
      });
      continue;
    }
    rawScores[dimension] = rawValue > 10 ? rawValue / 10 : rawValue;
  }
  if (issues.length > 0) return { issues };

  const weights = normalizeWeights(record(source.weights));
  const overall = Number(scoreDimensions
    .reduce((sum, dimension) => sum + rawScores[dimension] * weights[dimension], 0)
    .toFixed(2));
  const rationale = record(source.rationale);
  const verdict = record(analysis.verdict);
  const confidenceFallback = numberValue(verdict.confidence);
  const confidenceSource = record(source.confidence);
  const confidence = Object.fromEntries(scoreDimensions.map((dimension) => {
    const rawConfidence = numberValue(confidenceSource[dimension]) ?? confidenceFallback ?? 50;
    const normalized = rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence;
    return [dimension, Math.max(0, Math.min(100, normalized))];
  })) as Record<ScoreDimension, number>;

  const finding = (dimension: ScoreDimension): string => {
    const legacyAlias = aliases[dimension].find((alias) => rationale[alias] !== undefined);
    return text(valueAt(
      source,
      `${dimension}Finding`,
      `${dimension}_finding`,
    )) || text(legacyAlias ? rationale[legacyAlias] : rationale[dimension]);
  };

  return {
    issues: [],
    scores: {
      ...rawScores,
      overall,
      verdict: verdictForScore(overall),
      financialFinding: finding("financial"),
      marketFinding: finding("market"),
      achievabilityFinding: finding("achievability"),
      riskFinding: finding("risk"),
      timingFinding: finding("timing"),
      operationalFinding: finding("operational"),
      weights,
      confidence,
      rationale: {
        financial: finding("financial"),
        market: finding("market"),
        achievability: finding("achievability"),
        risk: finding("risk"),
        timing: finding("timing"),
        operational: finding("operational"),
      },
    },
  };
};

const normalizeMarket = (analysis: UnknownRecord, warnings: Set<string>) => {
  const source = record(analysis.market);
  const growth = valueAt(source, "growthChart", "growth_chart");
  const growthChart = Array.isArray(growth)
    ? growth.map((item) => {
        const row = record(item);
        return {
          year: text(row.year),
          tam: Math.max(0, numberValue(row.tam) ?? 0),
          sam: Math.max(0, numberValue(row.sam) ?? 0),
        };
      })
    : [];
  const tamValue = text(valueAt(source, "tamValue", "tam_value", "tam"));
  const samValue = text(valueAt(source, "samValue", "sam_value", "sam"));
  const somValue = text(valueAt(source, "somValue", "som_value", "som"));
  if (!tamValue || !samValue || !somValue) {
    warnings.add("Market sizing is incomplete; unavailable values are shown as empty.");
  }
  return {
    tamLabel: text(valueAt(source, "tamLabel", "tam_label")),
    tamValue,
    tamCagr: text(valueAt(source, "tamCagr", "tam_cagr", "cagr")),
    samLabel: text(valueAt(source, "samLabel", "sam_label")),
    samValue,
    samCagr: text(valueAt(source, "samCagr", "sam_cagr", "cagr")),
    somLabel: text(valueAt(source, "somLabel", "som_label")),
    somValue,
    somCagr: text(valueAt(source, "somCagr", "som_cagr", "cagr")),
    growthChart,
    currency: text(valueAt(source, "currency")),
  };
};

const normalizeCustomer = (analysis: UnknownRecord, warnings: Set<string>) => {
  const source = record(analysis.customer);
  if (Object.keys(source).length === 0) {
    warnings.add("Customer profile evidence was not supplied by the external analysis.");
  }
  return {
    ageLocation: text(valueAt(source, "ageLocation", "age_location", "segment", "profile")),
    income: text(valueAt(source, "income", "budget")),
    goals: text(valueAt(source, "goals", "needs")),
    willingnessToPay: text(valueAt(source, "willingnessToPay", "willingness_to_pay")),
    behavior: text(valueAt(source, "behavior", "behaviour")),
  };
};

const normalizeCompetitors = (analysis: UnknownRecord, warnings: Set<string>) => {
  const market = record(analysis.market);
  const source = valueAt(analysis, "competitors") ?? market.competitors;
  if (!Array.isArray(source)) {
    warnings.add("Competitor evidence was not supplied by the external analysis.");
    return [];
  }
  return source.map((item) => {
    const row = record(item);
    const model = text(valueAt(row, "model", "business_model", "positioning", "category"));
    const strengths = text(valueAt(row, "strengths", "strength"));
    return {
      name: text(valueAt(row, "name", "title")),
      model: model && strengths ? `${model} — Strengths: ${strengths}` : model || strengths,
      weakness: text(valueAt(row, "weakness", "weaknesses", "gap")),
      edge: text(valueAt(row, "edge", "advantage", "differentiator", "gap_or_opening")),
    };
  });
};

const normalizeFinancials = (analysis: UnknownRecord, warnings: Set<string>) => {
  const source = record(analysis.financials);
  const currency = text(valueAt(source, "currency"));
  const rawCapEx = valueAt(source, "capEx", "capex", "cap_ex");
  const capEx = (Array.isArray(rawCapEx) ? rawCapEx : [])
    .map((item) => {
      const row = record(item);
      const category = text(valueAt(row, "category", "item", "name", "title"));
      const amount = Math.max(0, numberValue(valueAt(row, "amount", "value")) ?? 0);
      const low = Math.max(0, numberValue(valueAt(row, "low", "min", "minimum")) ?? amount);
      const high = Math.max(0, numberValue(valueAt(row, "high", "max", "maximum")) ?? amount);
      return {
        category,
        low: Math.min(low, high),
        high: Math.max(low, high),
        notes: text(valueAt(row, "notes", "note", "description")),
      };
    })
    .filter((item) => item.category && !/\btotal\b/i.test(item.category));

  const low = capEx.reduce((sum, item) => sum + item.low, 0);
  const high = capEx.reduce((sum, item) => sum + item.high, 0);
  const rawOpEx = valueAt(source, "opEx", "opex", "op_ex");
  const opEx = (Array.isArray(rawOpEx) ? rawOpEx : [])
    .map((item) => {
      const row = record(item);
      const category = text(valueAt(row, "category", "item", "name", "title"));
      const year = numberValue(row.year);
      if (/\btotal\b/i.test(category) || (year !== undefined && year !== 1)) return null;
      const annual = Math.max(
        0,
        numberValue(valueAt(row, "annual", "annual_amount", "amount", "year1", "year_1")) ?? 0,
      );
      const monthly = Math.max(
        0,
        numberValue(valueAt(row, "monthly", "monthly_amount")) ?? (annual > 0 ? annual / 12 : 0),
      );
      return {
        category,
        monthly: Number(monthly.toFixed(2)),
        annual: Number((annual || monthly * 12).toFixed(2)),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const rawScenarios = valueAt(source, "scenarios", "revenue");
  const scenarios = (Array.isArray(rawScenarios) ? rawScenarios : []).map((item) => {
    const row = record(item);
    const revenueSource = valueAt(row, "annualRevenue", "annual_revenue", "revenue", "year_3_revenue");
    const revenueText = text(revenueSource);
    const annualRevenue = (
      typeof revenueSource === "number" && currency
        ? `${currency} ${revenueText}`
        : revenueText
    );
    return {
      scenario: scenarioName(valueAt(row, "scenario", "name", "case")),
      probability: text(valueAt(row, "probability", "probability_pct")),
      subscribersYr1: text(valueAt(row, "subscribersYr1", "subscribers_yr1", "units", "customers")),
      annualRevenue,
      breakEven: text(valueAt(
        row,
        "breakEven",
        "break_even",
        "estimated_cumulative_cash_break_even",
        "estimated_operating_break_even",
        "estimated_cumulative_break_even",
      )),
    };
  });

  if (capEx.length === 0 || opEx.length === 0 || scenarios.length === 0) {
    warnings.add("Financial detail is incomplete; unavailable rows are shown as empty.");
  }
  const breakEvenMonths = numberValue(valueAt(source, "break_even_months"));
  const investmentRange = text(valueAt(source, "investmentRange", "investment_range"))
    || (capEx.length > 0 ? `${low}–${high}${currency ? ` ${currency}` : ""}` : "");
  const breakEvenSummary = text(valueAt(source, "breakEvenSummary", "break_even_summary"))
    || (breakEvenMonths !== undefined ? `Month ${breakEvenMonths}` : "");

  return {
    currency,
    capExTotal: { low, high, mid: Number(((low + high) / 2).toFixed(2)) },
    capEx,
    opEx,
    scenarios,
    investmentRange,
    breakEvenSummary,
    ltvCacRatio: text(valueAt(source, "ltvCacRatio", "ltv_cac_ratio")),
  };
};

const normalizeRisks = (analysis: UnknownRecord, warnings: Set<string>) => {
  if (!Array.isArray(analysis.risks)) {
    warnings.add("Risk register details were not supplied by the external analysis.");
    return [];
  }
  return analysis.risks.map((item) => {
    const row = record(item);
    const impact = titleCaseLevel(valueAt(row, "impact", "severity", "level"));
    const probability = titleCaseLevel(valueAt(row, "probability", "likelihood"));
    return {
      name: text(valueAt(row, "name", "title", "risk")),
      probability,
      impact,
      level: titleCaseLevel(valueAt(row, "level", "severity", "impact")),
      mitigation: text(valueAt(row, "mitigation", "response", "treatment")),
    };
  });
};

const normalizeFundingMix = (analysis: UnknownRecord, warnings: Set<string>) => {
  const source = valueAt(analysis, "fundingMix", "funding_mix");
  if (!Array.isArray(source)) {
    warnings.add("Funding mix was not supplied by the external analysis.");
    return [];
  }
  return source.map((item) => {
    const row = record(item);
    return {
      source: text(valueAt(row, "source", "name", "type")),
      share: text(valueAt(row, "share", "percentage", "percent")),
      amount: text(valueAt(row, "amount", "value")),
      rationale: text(valueAt(row, "rationale", "reason", "notes")),
    };
  });
};

const normalizeResearch = (analysis: UnknownRecord) => {
  const source = record(analysis.research);
  const claims = Array.isArray(analysis.claims) ? analysis.claims : [];
  if (Object.keys(source).length === 0 && claims.length === 0) return undefined;
  if (Object.keys(source).length === 0) {
    const confidenceValues = claims.map((claim) => (
      text(record(claim).confidence).toLowerCase()
    ));
    const highShare = confidenceValues.length > 0
      ? confidenceValues.filter((value) => value === "high").length / confidenceValues.length
      : 0;
    const citations = claims.flatMap((claim) => {
      const claimRecord = record(claim);
      const sources = Array.isArray(claimRecord.sources) ? claimRecord.sources : [];
      return sources.map((claimSource) => {
        const sourceRecord = record(claimSource);
        return {
          title: text(sourceRecord.title),
          url: text(sourceRecord.url),
          source: text(valueAt(sourceRecord, "source", "domain")),
          takeaway: text(valueAt(claimRecord, "text", "claim")),
        };
      });
    });
    const market = record(analysis.market);
    return {
      overview: `External analysis supplied ${claims.length} sourced evidence claim${claims.length === 1 ? "" : "s"}.`,
      confidence: highShare >= 0.7 ? "High" as const : highShare >= 0.4 ? "Medium" as const : "Low" as const,
      sentiment: "Mixed" as const,
      keySignals: stringList(market.signals),
      painPoints: [],
      competitorMentions: (
        Array.isArray(market.competitors)
          ? market.competitors.map((item) => text(record(item).name)).filter(Boolean)
          : []
      ),
      redditSignals: [],
      webSignals: claims.map((claim) => text(valueAt(record(claim), "text", "claim"))).filter(Boolean),
      citations,
    };
  }
  const confidenceValue = text(source.confidence).toLowerCase();
  const sentimentValue = text(source.sentiment).toLowerCase();
  const rawCitations = Array.isArray(source.citations) ? source.citations : [];
  return {
    overview: text(source.overview),
    confidence: confidenceValue === "high" ? "High" as const
      : confidenceValue === "medium" ? "Medium" as const
      : "Low" as const,
    sentiment: sentimentValue === "positive" ? "Positive" as const
      : sentimentValue === "mixed" ? "Mixed" as const
      : sentimentValue === "negative" ? "Negative" as const
      : "Insufficient data" as const,
    keySignals: stringList(valueAt(source, "keySignals", "key_signals")),
    painPoints: stringList(valueAt(source, "painPoints", "pain_points")),
    competitorMentions: stringList(valueAt(source, "competitorMentions", "competitor_mentions")),
    redditSignals: stringList(valueAt(source, "redditSignals", "reddit_signals")),
    webSignals: stringList(valueAt(source, "webSignals", "web_signals")),
    citations: rawCitations.map((item) => {
      const row = record(item);
      return {
        title: text(row.title),
        url: text(row.url),
        source: text(row.source),
        takeaway: text(row.takeaway),
      };
    }),
  };
};

export function normalizeExternalAnalysis(
  payload: unknown,
  options: ExternalNormalizationOptions = {},
): ExternalNormalizationResult {
  if (!isRecord(payload)) {
    return { valid: false, issues: [{ path: "$", message: "payload must be an object" }] };
  }
  const analysis = record(valueAt(payload, "analysis", "output", "report"));
  if (Object.keys(analysis).length === 0) {
    return {
      valid: false,
      issues: [{ path: "analysis", message: "analysis object is required" }],
    };
  }

  const inputs = normalizeInputs(payload);
  const scoreResult = normalizeScores(analysis);
  if (!scoreResult.scores) return { valid: false, issues: scoreResult.issues };

  const summary = text(valueAt(analysis, "executiveSummary", "executive_summary"))
    || text(record(analysis.verdict).summary);
  if (!summary) {
    return {
      valid: false,
      issues: [{
        path: "analysis.executiveSummary",
        message: "executiveSummary (or legacy executive_summary/verdict.summary) is required",
      }],
    };
  }

  const warnings = new Set<string>([
    ...stringList(valueAt(analysis, "evidenceWarnings", "evidence_warnings")),
  ]);
  const reportId = options.reportId
    || text(valueAt(analysis, "reportId", "report_id"))
    || text(valueAt(payload, "reportId", "report_id"))
    || "EXTERNAL-PENDING";
  const output: FeasibilityReport = {
    reportId,
    dateIssued: options.dateIssued
      || text(valueAt(analysis, "dateIssued", "date_issued"))
      || new Date().toISOString().slice(0, 10),
    classification: text(analysis.classification) || "Confidential",
    preparedBy: text(valueAt(analysis, "preparedBy", "prepared_by")) || "Concept AI External Analysis",
    methodology: text(analysis.methodology) || "FMART-O 6-Dimension Weighted Scoring",
    executiveSummary: summary,
    scores: scoreResult.scores,
    market: normalizeMarket(analysis, warnings),
    customer: normalizeCustomer(analysis, warnings),
    competitors: normalizeCompetitors(analysis, warnings),
    research: normalizeResearch(analysis),
    financials: normalizeFinancials(analysis, warnings),
    risks: normalizeRisks(analysis, warnings),
    fundingMix: normalizeFundingMix(analysis, warnings),
    fundingAdvisory: text(valueAt(analysis, "fundingAdvisory", "funding_advisory")),
    recommendations: stringList(analysis.recommendations),
    nextSteps: stringList(valueAt(analysis, "nextSteps", "next_steps")),
    evidenceWarnings: [...warnings],
  };

  const optionalEvidenceFields = [
    "inputQualityScore",
    "inputCompleteness",
    "evidenceMix",
    "scoreExplanation",
    "claimEvidenceMap",
    "reportVersions",
    "decision",
    "legacyEvidence",
  ] as const;
  const outputRecord = output as unknown as UnknownRecord;
  for (const field of optionalEvidenceFields) {
    if (analysis[field] !== undefined) outputRecord[field] = analysis[field];
  }

  const validated = validateCanonicalReportData(inputs, output);
  if (!("output" in validated)) return { valid: false, issues: validated.issues };
  return {
    valid: true,
    issues: [],
    inputs: validated.inputs,
    output: validated.output,
    warnings: [...warnings],
  };
}
