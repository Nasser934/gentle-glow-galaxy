// ============================================================
// Concept AI — full data model (FMART feasibility report)
// ============================================================

export interface ConceptInputs {
  // Project Overview
  projectName: string;
  industry: string;
  location: string;
  description: string;
  strategicObjectives: string;
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
}

export const initialInputs: ConceptInputs = {
  projectName: "",
  industry: "",
  location: "",
  description: "",
  strategicObjectives: "",
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
};

// ============================================================
// FMART scoring
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
  subscribersYr1: string;    // "1,500" — generic units allowed
  annualRevenue: string;     // "SAR 18.9M"
  breakEven: string;         // "Month 3"
}

export interface Financials {
  currency: string;
  capExTotal: { low: number; high: number; mid: number };
  capEx: CapExItem[];
  opEx: OpExItem[];
  scenarios: RevenueScenario[];
  investmentRange: string;        // "380–620k SAR"
  breakEvenSummary: string;       // "Month 4–6"
  ltvCacRatio?: string;           // "28x–32x"
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

  financials: Financials;

  risks: RiskRow[];

  fundingMix: FundingSource[];
  fundingAdvisory: string;

  recommendations: string[];     // strategic recommendations bullets
  nextSteps: string[];
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
