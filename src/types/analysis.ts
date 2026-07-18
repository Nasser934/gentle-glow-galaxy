// ============================================================
// Concept AI — full data model (FMART-O feasibility report)
// ============================================================

export interface ConceptInputs {
  // Project Overview
  projectName: string;
  industry: string;
  location: string;
  description: string;
  strategicObjectives: string;
  // Business model (Phase 2)
  businessModel: string;        // e.g. SaaS, Marketplace, Hardware, Services
  revenueModel: string;         // e.g. Subscription, Transaction fee, License
  founderExperience: string;    // years/domain experience summary
  // Scope & Resources
  budgetRange: string;
  timeline: string;
  teamSize: string;
  dependencies: string;
  // Assumptions & Constraints
  assumptions: string;
  constraints: string;
  successFactors: string;
  // Risk Inputs
  knownRisks: string;
  regulatoryConsiderations: string;
  technologyReadiness: string;
  // Competitive intel (Phase 2 — comma/newline-separated URLs)
  competitorUrls: string;
}

export const initialInputs: ConceptInputs = {
  projectName: "",
  industry: "",
  location: "",
  description: "",
  strategicObjectives: "",
  businessModel: "",
  revenueModel: "",
  founderExperience: "",
  budgetRange: "",
  timeline: "",
  teamSize: "",
  dependencies: "",
  assumptions: "",
  constraints: "",
  successFactors: "",
  knownRisks: "",
  regulatoryConsiderations: "",
  technologyReadiness: "",
  competitorUrls: "",
};

// ============================================================
// FMART-O scoring
// ============================================================
export interface FMARTScores {
  financial: number;       // 0-10
  market: number;          // 0-10
  achievability: number;   // 0-10  (technical)
  risk: number;            // 0-10  (inverse — higher = lower risk)
  timing: number;          // 0-10
  operational: number;     // 0-10
  overall: number;         // 0-10
  verdict: "PROCEED" | "PROCEED WITH CAUTION" | "REVISE" | "DO NOT PROCEED";
  financialFinding: string;
  marketFinding: string;
  achievabilityFinding: string;
  riskFinding: string;
  timingFinding: string;
  operationalFinding: string;
  // Phase 4 — methodology transparency
  weights?: {
    financial: number; market: number; achievability: number;
    risk: number; timing: number; operational: number;
  };
  confidence?: {
    financial: number; market: number; achievability: number;
    risk: number; timing: number; operational: number;
  };
  rationale?: {
    financial: string; market: string; achievability: string;
    risk: string; timing: string; operational: string;
  };
}

// ============================================================
// Market analysis
// ============================================================
export interface MarketSizing {
  tamLabel: string;
  tamValue: string;
  tamCagr: string;
  samLabel: string;
  samValue: string;
  samCagr: string;
  somLabel: string;
  somValue: string;
  somCagr: string;
  growthChart: Array<{ year: string; tam: number; sam: number }>;
  currency: string;
}

export interface CustomerProfile {
  ageLocation: string;
  income: string;
  goals: string;
  willingnessToPay: string;
  behavior: string;
}

export interface Competitor {
  name: string;
  model: string;
  weakness: string;
  edge: string;
}

export interface ResearchCitation {
  title: string;
  url: string;
  source: string;
  takeaway: string;
  sourceId?: string;
  domain?: string;
  publisher?: string;
  publicationDate?: string | null;
  accessDate?: string;
  sourceType?: string;
  quality?: SourceQuality;
  stale?: boolean;
}

export interface MarketResearch {
  overview: string;
  confidence: "High" | "Medium" | "Low";
  sentiment: "Positive" | "Mixed" | "Negative" | "Insufficient data";
  keySignals: string[];
  painPoints: string[];
  competitorMentions: string[];
  redditSignals: string[];
  webSignals: string[];
  citations: ResearchCitation[];
  coverage?: "Sufficient" | "Partial" | "Limited" | "No reliable external evidence";
  coverageMethod?: string;
  coverageMetrics?: {
    reliableSourceCount: number;
    independentReliableDomains: number;
    currentSourceCount: number;
    directClaimSupportCount: number;
  };
}

// ============================================================
// Financials
// ============================================================
export interface CapExItem {
  category: string;
  low: number;
  high: number;
  notes: string;
}

export interface OpExItem {
  category: string;
  monthly: number;
  annual: number;
}

export interface RevenueScenario {
  scenario: "Optimistic" | "Base Case" | "Pessimistic";
  probability: string;       // "30%"
  subscribersYr1?: string;   // commercial projects only
  annualRevenue?: string;    // commercial projects only
  adoptionRate?: number;     // internal projects: 0-1
  annualLabourCostAvoided?: number;
  annualProductivityBenefit?: number;
  annualFinancialBenefit?: number;
  annualValueDisplay?: string;
  breakEven: string;         // "Month 3"
}

export interface Financials {
  currency: string;
  projectType?: "commercial" | "internal";
  capExTotal: { low: number; high: number; mid: number };
  capEx: CapExItem[];
  opEx: OpExItem[];
  scenarios: RevenueScenario[];
  investmentRange: string;        // "380–620k SAR"
  breakEvenSummary: string;       // "Month 4–6"
  ltvCacRatio?: string;           // "28x–32x"
  assumptionStatus?: FigureValidationStatus;
}

// ============================================================
// Risks
// ============================================================
export interface RiskRow {
  name: string;
  probability: "Low" | "Med" | "High";
  impact: "Low" | "Med" | "High";
  level: "Low" | "Med" | "High";
  mitigation: string;
}

// ============================================================
// Funding
// ============================================================
export interface FundingSource {
  source: string;
  share: string;          // "40%"
  amount: string;         // "~200,000"
  rationale: string;
}

// ============================================================
// Full report
// ============================================================
export interface FeasibilityReport {
  reportId: string;
  dateIssued: string;
  classification: string;
  preparedBy: string;
  methodology: string;

  executiveSummary: string;     // markdown
  scores: FMARTScores;

  market: MarketSizing;
  customer: CustomerProfile;
  competitors: Competitor[];
  research?: MarketResearch;

  financials: Financials;
  normalizedFigures?: Record<string, NormalizedFigure>;

  risks: RiskRow[];

  fundingMix: FundingSource[];
  fundingAdvisory: string;

  recommendations: string[];     // strategic recommendations bullets
  nextSteps: string[];

  // ----------------------------------------------------------
  // Consumer Evidence & Improvement Layer (all optional — added
  // by ensureEvidenceFields() so old reports stay compatible).
  // ----------------------------------------------------------
  inputQualityScore?: number; // 0-100
  inputCompleteness?: {
    overall: number;
    missingFields: string[];
    weakFields: string[];
    contradictoryFields: string[];
  };
  inputFieldAssessments?: InputFieldAssessment[];
  inputOrigins?: Partial<Record<keyof ConceptInputs, "user_input" | "ai_suggestion" | "accepted_ai_suggestion" | "edited_after_ai_suggestion">>;
  evidenceMix?: {
    userInputPercent: number;
    webResearchPercent: number;
    calculationPercent?: number;
    aiAssumptionPercent: number;
    label?: string;
    method?: string;
  };
  scoreExplanation?: ScoreExplanationRow[];
  claimEvidenceMap?: ClaimEvidenceRow[];
  reportVersions?: ReportVersion[];
  decision?: DecisionVerdict;
  legacyEvidence?: boolean; // true when fields were derived (not authored by AI)
  demo?: {
    synthetic: boolean;
    label: string;
    disclaimer: string;
  };
  validationStatus?: "valid" | "valid_with_warnings";
  validationWarnings?: Array<{ code: string; message: string; path?: string }>;
  scoringAudit?: ScoringAudit;
  sources?: EvidenceSource[];
  claims?: EvidenceClaim[];
  reportSchemaVersion?: string;
  qualityMetadata?: QualityMetadata;
}

export type InputStatus = "complete" | "needs_improvement" | "weak" | "missing";

export interface InputFieldAssessment {
  key: keyof ConceptInputs;
  label: string;
  status: InputStatus;
  impact: string;
  suggestion: string;
}

export interface ScoreExplanationRow {
  dimension: "financial" | "market" | "achievability" | "risk" | "timing" | "operational";
  label: string;
  score: number;
  positiveDrivers: string[];
  negativeDrivers: string[];
  missingEvidence: string[];
  improvementActions: string[];
  decisionImplication: string;
}

export interface ClaimEvidenceRow {
  claimId: string;
  claimText: string;
  reportSection: string;
  userInputPercent: number;
  webResearchPercent: number;
  aiAssumptionPercent: number;
  confidence: "High" | "Medium" | "Low";
  sources: string[];
  userCanImproveBy: string;
  provenance?: ClaimProvenance;
  supportingSourceIds?: string[];
  conflictingSourceIds?: string[];
  dimensions?: Array<"financial" | "market" | "achievability" | "risk" | "timing" | "operational">;
  supportStatus?: "supported" | "conflicting" | "unsupported" | "ai_inference";
  calculationPercent?: number;
  displayStatus?: string;
}

export type FigureValidationStatus =
  | "Verified from user input"
  | "Supported by cited source"
  | "Calculated"
  | "AI estimate"
  | "Requires validation";

export interface NormalizedFigure {
  value: number | null;
  low: number | null;
  high: number | null;
  currency: "SAR" | "USD" | "AED" | "EUR" | "GBP" | null;
  unit: "money" | "percent" | "month" | "year" | "number" | null;
  displayText: string;
  status: FigureValidationStatus;
  label: string;
}

export type ClaimProvenance = "User input" | "Cited source" | "Calculation" | "AI inference" | "Mixed" | "Unknown";

export type SourceQuality =
  | "Primary official source"
  | "Government or regulator"
  | "Academic or institutional"
  | "Company source"
  | "Reputable industry research"
  | "Community signal"
  | "General reference"
  | "Unknown";

export interface EvidenceSource {
  sourceId: string;
  title: string;
  url: string;
  domain: string;
  publisher: string;
  publicationDate?: string | null;
  accessDate: string;
  sourceType: string;
  quality: SourceQuality;
  stale?: boolean;
}

export interface EvidenceClaim {
  claimId: string;
  claimText: string;
  reportSection: string;
  provenance: ClaimProvenance;
  supportingSourceIds: string[];
  conflictingSourceIds: string[];
  dimensions?: Array<"financial" | "market" | "achievability" | "risk" | "timing" | "operational">;
  composition: {
    userInputPercent: number;
    citedSourcePercent: number;
    calculationPercent: number;
    aiInferencePercent: number;
  };
  supportStatus: "supported" | "conflicting" | "unsupported" | "ai_inference";
  displayStatus?: string;
}

export interface ScoringAudit {
  modelProposedOverall: number | null;
  modelProposedVerdict: string | null;
  serverCalculatedOverall: number;
  difference: number | null;
  finalAuthoritativeScore: number;
  weightsSource: "model_validated" | "industry_default";
  scoringEngineVersion: string;
}

export interface QualityMetadata {
  validationStatus: "valid" | "valid_with_warnings";
  validationWarnings: string[];
  scoringEngineVersion: string;
  promptVersion: string;
  modelId: string;
  reportSchemaVersion: string;
  inputHash: string;
  generationTimestamp: string;
  researchTimestamp: string;
  sourceCount: number;
  primarySourceCount: number;
  unsupportedClaimCount: number;
  financialWarningCount: number;
}

export interface ReportVersion {
  versionId: string;
  createdAt: string;
  changedInputs: string[];
  previousScore: number;
  newScore: number;
  scoreDelta: number;
  previousConfidence: number;
  newConfidence: number;
  confidenceDelta: number;
  previousAiAssumptionPercent: number;
  newAiAssumptionPercent: number;
  summary: string;
}

export type ConsumerVerdict =
  | "PROCEED"
  | "CONDITIONAL PROCEED"
  | "CONDITIONAL PROCEED WITH VALIDATION"
  | "IMPROVE INPUTS BEFORE INVESTMENT DECISION"
  | "REVISE"
  | "DO NOT PROCEED";

export interface DecisionVerdict {
  verdict: ConsumerVerdict;
  recommendationLabel: string;
  nextStepHint: string;
  blockers: string[];
  overallConfidencePct: number;
}

// ============================================================
// Dropdown options
// ============================================================
export const INDUSTRIES = [
  "Information Technology",
  "Telecommunications",
  "Infrastructure & Construction",
  "Government & Public Sector",
  "Real Estate & Property",
  "Healthcare & Life Sciences",
  "Financial Services",
  "Energy & Utilities",
  "Manufacturing",
  "Food & Beverage",
  "Retail & E-commerce",
  "Education",
  "Other",
] as const;

export const BUDGET_RANGES = [
  "< $50,000",
  "$50,000 – $250,000",
  "$250,000 – $1M",
  "$1M – $5M",
  "$5M – $25M",
  "> $25M",
] as const;

export const TIMELINES = [
  "< 3 months",
  "3 – 6 months",
  "6 – 12 months",
  "1 – 2 years",
  "2 – 5 years",
  "> 5 years",
] as const;

export const TEAM_SIZES = [
  "1 – 5",
  "6 – 15",
  "16 – 50",
  "51 – 100",
  "> 100",
] as const;

export const TECHNOLOGY_READINESS = [
  "Proven / Mature",
  "Established / Widely Used",
  "Emerging / Early Adoption",
  "Experimental / R&D Phase",
  "Unknown / Not Yet Assessed",
] as const;

export const BUSINESS_MODELS = [
  "Internal Platform / Cost Avoidance",
  "SaaS / Subscription Software",
  "Marketplace / Platform",
  "Hardware / Devices",
  "Professional Services",
  "Consumer Product (D2C)",
  "Wholesale / Distribution",
  "Infrastructure / Capex Project",
  "Government Contract / PPP",
  "Other",
] as const;

export const REVENUE_MODELS = [
  "Cost avoidance / productivity benefit",
  "Recurring subscription",
  "Transaction / commission fee",
  "License / one-time sale",
  "Usage-based metering",
  "Advertising",
  "Project / milestone billing",
  "Tariff / regulated revenue",
  "Mixed",
] as const;
