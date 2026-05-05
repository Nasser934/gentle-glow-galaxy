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
  // Business model (Phase 2)
  businessModel: string;
  revenueModel: string;
  founderExperience: string;
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
// FMART scoring
// ============================================================
export interface FMARTScores {
  financial: number;
  market: number;
  achievability: number;
  risk: number;
  timing: number;
  operational: number;
  overall: number;
  verdict: "PROCEED" | "PROCEED WITH CAUTION" | "REVISE" | "DO NOT PROCEED";
  financialFinding: string;
  marketFinding: string;
  achievabilityFinding: string;
  riskFinding: string;
  timingFinding: string;
  operationalFinding: string;
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
// McKinsey-style narrative architecture
// ============================================================
export interface NarrativeArchitecture {
  governingThesis: string;
  keyArguments: Array<{
    argument: string;
    evidence: string;
    implication: string;
  }>;
  situation: string;
  complication: string;
  resolution: string;
  limitations: string[];
}

export interface ActionTitles {
  executiveSummary: string;
  marketAnalysis: string;
  technicalFeasibility: string;
  financialAnalysis: string;
  riskAssessment: string;
  fundingInvestorReturns: string;
  goToMarket: string;
  implementationRoadmap: string;
  recommendations: string;
}

export interface ManagementTeamDeepDive {
  members: Array<{
    name: string;
    role: string;
    relevantCredentials: string;
    projectRelevance: string;
  }>;
  skillsGapAnalysis: Array<{
    gap: string;
    impact: string;
    hiringAction: string;
    targetTiming: string;
    estimatedCost: string;
  }>;
  operatingModel: string;
}

export interface GoToMarketStrategy {
  channelStrategy: Array<{
    channel: string;
    role: string;
    rationale: string;
    year1Target: string;
  }>;
  pricingLadder: Array<{
    tier: string;
    targetCustomer: string;
    pricePoint: string;
    featureGate: string;
  }>;
  acquisitionPlaybook: Array<{
    segment: string;
    whyFirst: string;
    message: string;
    expectedSalesCycle: string;
    cacEstimate: string;
  }>;
  pipelineTargets: Array<{
    segment: string;
    leads: string;
    opportunities: string;
    expectedCustomers: string;
  }>;
}

export interface TechnologyArchitecture {
  architectureSummary: string;
  stackDecisions: Array<{
    layer: string;
    choice: string;
    rationale: string;
  }>;
  dataPipelineDesign: string;
  securityArchitecture: string;
  apiGovernance: string;
  scalabilityModel: string;
  architectureDiagram: Array<{
    component: string;
    responsibility: string;
    interfaces: string;
  }>;
}

export interface FinancialStressTesting {
  monthlyCashFlow: Array<{
    month: string;
    revenue: number;
    opex: number;
    capex: number;
    netCashFlow: number;
    closingCash: number;
  }>;
  sensitivity: Array<{
    variable: string;
    baseCase: string;
    downsideCase: string;
    impactOnBreakEven: string;
    mitigation: string;
  }>;
  unitEconomics: {
    arpu: string;
    churnRate: string;
    grossMargin: string;
    paybackPeriod: string;
    cac: string;
  };
  valuationMetrics: Array<{
    scenario: string;
    npv: string;
    irr: string;
    payback: string;
  }>;
}

export interface InvestorReturns {
  targetIrr: string;
  exitScenarios: Array<{
    route: string;
    likelyAcquirers: string;
    valuationLogic: string;
    timing: string;
  }>;
  comparableExits: Array<{
    company: string;
    geography: string;
    exitType: string;
    relevance: string;
  }>;
  fiveYearValuation: Array<{
    year: string;
    revenue: string;
    multiple: string;
    impliedValuation: string;
  }>;
}

export interface PrimaryResearchPlan {
  interviewTargets: string;
  questions: string[];
  validationNeeded: string[];
  currentEvidenceGap: string;
  sampleQuotes?: string[];
}

export interface QuantifiedRiskRow {
  risk: string;
  probabilityPercent: number;
  financialImpact: string;
  expectedValue: string;
  owner: string;
  mitigation: string;
}

export interface ImplementationRoadmap {
  phases: Array<{
    phase: string;
    timeline: string;
    keyActivities: string;
    decisionGate: string;
    successMetric: string;
  }>;
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
  probability: string;
  subscribersYr1: string;
  annualRevenue: string;
  breakEven: string;
}

export interface Financials {
  currency: string;
  capExTotal: { low: number; high: number; mid: number };
  capEx: CapExItem[];
  opEx: OpExItem[];
  scenarios: RevenueScenario[];
  investmentRange: string;
  breakEvenSummary: string;
  ltvCacRatio?: string;
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
  share: string;
  amount: string;
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

  narrative?: NarrativeArchitecture;
  actionTitles?: ActionTitles;
  managementTeam?: ManagementTeamDeepDive;
  goToMarket?: GoToMarketStrategy;
  technologyArchitecture?: TechnologyArchitecture;
  financialStressTesting?: FinancialStressTesting;
  investorReturns?: InvestorReturns;
  primaryResearch?: PrimaryResearchPlan;
  quantifiedRisks?: QuantifiedRiskRow[];
  implementationRoadmap?: ImplementationRoadmap;

  executiveSummary: string;
  scores: FMARTScores;

  market: MarketSizing;
  customer: CustomerProfile;
  competitors: Competitor[];
  research?: MarketResearch;

  financials: Financials;

  risks: RiskRow[];

  fundingMix: FundingSource[];
  fundingAdvisory: string;

  recommendations: string[];
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

export const BUSINESS_MODELS = [
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
  "Recurring subscription",
  "Transaction / commission fee",
  "License / one-time sale",
  "Usage-based metering",
  "Advertising",
  "Project / milestone billing",
  "Tariff / regulated revenue",
  "Mixed",
] as const;
