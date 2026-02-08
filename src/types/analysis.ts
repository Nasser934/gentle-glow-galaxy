export interface ConceptInputs {
  // Step 1
  projectName: string;
  industry: string;
  description: string;
  strategicObjectives: string;
  // Step 2
  budgetRange: string;
  timeline: string;
  teamSize: string;
  dependencies: string;
  // Step 3
  assumptions: string;
  constraints: string;
  successFactors: string;
  // Step 4
  knownRisks: string;
  regulatoryConsiderations: string;
  technologyReadiness: string;
}

export interface RiskItem {
  name: string;
  likelihood: number; // 1-5
  impact: number; // 1-5
  description: string;
  mitigation: string;
}

export interface FeasibilityScores {
  value: number;
  valueExplanation: string;
  risk: number;
  riskExplanation: string;
  complexity: number;
  complexityExplanation: string;
}

export interface AnalysisResult {
  scores: FeasibilityScores;
  recommendation: "go" | "revise" | "stop";
  recommendationReasoning: string;
  keyFactors: string[];
  risks: RiskItem[];
  summary: string;
  assumptions: Array<{ text: string; confidence: "high" | "medium" | "low" }>;
  nextSteps: string[];
}

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
