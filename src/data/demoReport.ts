import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

/**
 * Static demo case used by the "Load Demo Case" button so we can present
 * Concept AI even if the live AI pipeline is slow or offline.
 *
 * This data is local-only and NEVER written to the database.
 */
export const DEMO_REPORT_ID = "demo";

export const demoInputs: ConceptInputs = {
  projectName: "Project Atlas — Internal Field-Ops Platform",
  industry: "Infrastructure & Construction",
  location: "Riyadh, Saudi Arabia",
  description:
    "An internal mobile + web platform that digitises daily field operations for our construction crews — work orders, daily diaries, safety incidents, photo evidence, and progress reporting — feeding a real-time PMO dashboard.",
  strategicObjectives:
    "Cut daily reporting effort by 70%, eliminate paper diaries, surface schedule slippage 2 weeks earlier, and standardise HSE incident capture across 14 sites.",
  businessModel: "Internal platform (no external revenue)",
  revenueModel: "Internal cost savings & productivity uplift",
  founderExperience: "PMO leadership with 12+ years delivering capex programs across GCC.",
  budgetRange: "$250,000 – $1M",
  timeline: "6 – 12 months",
  teamSize: "6 – 15",
  dependencies: "Existing ERP (SAP), Active Directory, on-site iPads, Azure tenant.",
  assumptions:
    "Site supervisors will adopt mobile capture if the form takes <2 minutes. Connectivity is intermittent on 4 of 14 sites — offline mode required.",
  constraints:
    "Must comply with internal data residency (KSA) and pass IT security review before production. No vendor lock-in.",
  successFactors:
    "Executive sponsor in PMO, weekly adoption KPI in steerco, mandatory rollout per site phase.",
  knownRisks:
    "Field adoption resistance, offline sync conflicts, integration delays with SAP work-order module.",
  regulatoryConsiderations: "PDPL (KSA Personal Data Protection Law), internal HSE reporting standards.",
  technologyReadiness: "Established / Widely Used",
  competitorUrls: "",
};

export const demoReport: FeasibilityReport = {
  reportId: "DEMO-ATLAS-001",
  dateIssued: new Date().toISOString().slice(0, 10),
  classification: "Internal · Demo",
  preparedBy: "Concept AI",
  methodology: "FMART-O 6-Dimension Weighted Scoring with grounded research synthesis.",
  executiveSummary:
    "Project Atlas digitises daily field operations across 14 sites. The analysis shows a strong operational case driven by measurable labour-time savings (~70% reduction in reporting) and earlier surfacing of schedule slippage. Financial value is internal — cost avoidance and productivity uplift rather than external revenue. The dominant risk is field adoption; this is mitigated by phased rollout, mandatory steerco KPI, and an offline-first mobile design. Recommended verdict: PROCEED WITH CAUTION, conditional on a 3-site pilot demonstrating sustained adoption above 75% within 6 weeks.",
  scores: {
    financial: 7.2,
    market: 6.8,
    achievability: 8.1,
    risk: 6.5,
    timing: 7.8,
    operational: 8.4,
    overall: 7.6,
    verdict: "PROCEED WITH CAUTION",
    financialFinding:
      "Strong internal ROI from labour-time savings (~28,000 hours/yr) and earlier slippage detection. Payback ~14 months.",
    marketFinding:
      "Internal platform — no external market, but clear demand from 14 active sites and PMO mandate.",
    achievabilityFinding:
      "Stack is mature (React Native + Azure). Offline sync is the only non-trivial engineering challenge.",
    operationalFinding:
      "PMO sponsorship and steerco KPI in place. Site-by-site rollout plan reduces operational shock.",
    riskFinding:
      "Adoption risk is the dominant exposure. SAP integration timeline is the secondary risk.",
    timingFinding:
      "Aligned with FY26 capex cycle and current PMO digitisation mandate. Delaying loses one budget window.",
    weights: { financial: 0.20, market: 0.10, achievability: 0.20, risk: 0.20, timing: 0.10, operational: 0.20 },
    confidence: { financial: 0.72, market: 0.55, achievability: 0.85, risk: 0.65, timing: 0.78, operational: 0.82 },
    rationale: {
      financial: "Savings model anchored in 2024 internal timesheet sample (n=120 supervisors).",
      market: "Internal demand only — confidence limited by absence of external benchmarks.",
      achievability: "Reference architecture exists; team has shipped similar offline-capable app in 2023.",
      risk: "Adoption risk inferred from prior internal rollouts; mitigations are concrete.",
      timing: "FY26 budget alignment confirmed by PMO finance partner.",
      operational: "Steerco governance and site-level champions documented in change plan.",
    },
  },
  market: {
    tamLabel: "All field operations spend across our 14 active programs",
    tamValue: "SAR 2.1B",
    tamCagr: "8%",
    samLabel: "Reporting & supervision labour cost addressable by digitisation",
    samValue: "SAR 180M",
    samCagr: "10%",
    somLabel: "Year-1 captured savings across phased site rollout",
    somValue: "SAR 12M",
    somCagr: "—",
    growthChart: [
      { year: "2026", tam: 2100, sam: 180 },
      { year: "2027", tam: 2268, sam: 198 },
      { year: "2028", tam: 2449, sam: 218 },
    ],
    currency: "SAR",
  },
  customer: {
    ageLocation: "Site supervisors, foremen, QA/HSE leads across KSA programs",
    income: "Internal — staff users",
    goals: "Spend less time on paperwork, surface issues earlier, evidence safety compliance.",
    willingnessToPay: "N/A — mandated internal tool",
    behavior: "Mobile-first, intermittent connectivity, prefer photo + voice capture over typing.",
  },
  competitors: [
    {
      name: "Procore (commercial SaaS)",
      model: "Cloud SaaS, per-seat",
      weakness: "Heavy admin overhead, weak Arabic UX, limited offline.",
      edge: "Direct integration with our SAP and PMO dashboards; KSA data residency.",
    },
    {
      name: "Manual / Excel + WhatsApp (status quo)",
      model: "Paper diaries + chat",
      weakness: "Lost data, no audit trail, delayed PMO visibility.",
      edge: "Structured capture, immutable audit log, real-time PMO roll-up.",
    },
  ],
  research: {
    overview:
      "Internal time-and-motion study (Q4 2025) and 18 supervisor interviews confirm 2.4 hrs/day spent on reporting. Industry benchmarks (McKinsey 2024 construction productivity report) show 25–35% labour productivity gain from field digitisation.",
    confidence: "High",
    sentiment: "Positive",
    keySignals: [
      "Supervisors report 2.4 hrs/day on paperwork (internal study, n=18).",
      "PMO loses ~11 days of visibility on schedule slippage on average.",
      "HSE incident reports are 40% incomplete under paper process.",
    ],
    painPoints: [
      "Lost daily diaries during site handover.",
      "No photo evidence linked to work orders.",
      "Manual roll-up to PMO dashboard takes 3 days.",
    ],
    competitorMentions: ["Procore", "Autodesk Construction Cloud", "Fieldwire"],
    redditSignals: [
      "r/ConstructionManagers: offline-first apps are the #1 unmet need.",
    ],
    webSignals: [
      "McKinsey 2024: digitisation of field ops yields 25–35% productivity uplift.",
    ],
    citations: [
      {
        title: "McKinsey — Reinventing Construction Productivity",
        url: "https://www.mckinsey.com/industries/capital-projects-and-infrastructure",
        source: "McKinsey",
        takeaway: "Field digitisation delivers 25–35% labour productivity uplift in capex programs.",
      },
      {
        title: "Internal Time-and-Motion Study Q4 2025",
        url: "",
        source: "PMO Internal",
        takeaway: "Supervisors spend 2.4 hrs/day on paperwork (n=18, 4 sites).",
      },
      {
        title: "KSA PDPL — data residency requirements",
        url: "https://sdaia.gov.sa/en/SDAIA/about/Pages/PersonalDataProtection.aspx",
        source: "SDAIA",
        takeaway: "Internal HR/operations data must remain in KSA-region cloud.",
      },
      {
        title: "Procore product page — offline limitations",
        url: "https://www.procore.com",
        source: "Procore",
        takeaway: "Offline mode is read-mostly; write-sync conflicts reported by users.",
      },
      {
        title: "Reddit r/ConstructionManagers — offline-first thread",
        url: "https://www.reddit.com/r/ConstructionManagers",
        source: "Reddit",
        takeaway: "Practitioners consistently rank offline reliability above feature breadth.",
      },
    ],
  },
  financials: {
    currency: "SAR",
    capExTotal: { low: 950000, high: 1450000, mid: 1200000 },
    capEx: [
      { category: "Engineering build (6 mo)", low: 600000, high: 900000, notes: "React Native + Azure backend, offline sync." },
      { category: "SAP integration", low: 180000, high: 280000, notes: "Work-order + cost-centre adapters." },
      { category: "Security & compliance", low: 80000, high: 140000, notes: "PDPL review, pen-test." },
      { category: "Rollout & change management", low: 90000, high: 130000, notes: "Site champions, training kits." },
    ],
    opEx: [
      { category: "Cloud (Azure KSA)", monthly: 18000, annual: 216000 },
      { category: "Support & SRE (2 FTE)", monthly: 55000, annual: 660000 },
      { category: "Continuous improvement", monthly: 22000, annual: 264000 },
    ],
    scenarios: [
      { scenario: "Optimistic",  probability: "25%", subscribersYr1: "1,200", annualRevenue: "SAR 18.0M", breakEven: "Month 9" },
      { scenario: "Base Case",   probability: "55%", subscribersYr1: "850",   annualRevenue: "SAR 12.0M", breakEven: "Month 14" },
      { scenario: "Pessimistic", probability: "20%", subscribersYr1: "500",   annualRevenue: "SAR 6.5M",  breakEven: "Month 22" },
    ],
    investmentRange: "950k – 1.45M SAR",
    breakEvenSummary: "Month 12 – 16",
    ltvCacRatio: "N/A — internal platform",
  },
  risks: [
    { name: "Field adoption below 60% in pilot",       probability: "Med", impact: "High", level: "High", mitigation: "Phased 3-site pilot; weekly steerco adoption KPI; site-level champions." },
    { name: "Offline sync conflicts",                  probability: "Med", impact: "Med",  level: "Med",  mitigation: "Last-write-wins for diaries; explicit conflict UI for work orders; QA on 4G/edge networks." },
    { name: "SAP integration slips",                   probability: "Med", impact: "Med",  level: "Med",  mitigation: "Decouple via integration adapter; mock service for first 3 months." },
    { name: "PDPL compliance gap",                     probability: "Low", impact: "High", level: "Med",  mitigation: "Azure KSA region; legal review at design + pre-production." },
    { name: "Key-person dependency on lead engineer",  probability: "Med", impact: "Med",  level: "Med",  mitigation: "Pair programming; documented ADRs; cross-training in month 2." },
  ],
  fundingMix: [
    { source: "FY26 PMO digitisation capex", share: "70%", amount: "~840,000", rationale: "Pre-approved digitisation envelope." },
    { source: "IT modernisation budget",     share: "20%", amount: "~240,000", rationale: "Covers Azure + security tooling." },
    { source: "HSE compliance reserve",      share: "10%", amount: "~120,000", rationale: "Funds HSE incident module per safety mandate." },
  ],
  fundingAdvisory:
    "All funding is internal; no external raise required. Confirm budget commitment in next PMO steerco before kick-off.",
  recommendations: [
    "Run a 3-site pilot for 8 weeks before full rollout.",
    "Lock SAP integration scope in week 2 to avoid late re-scoping.",
    "Define adoption KPI (>=75% daily active supervisors) as gating criterion for site 4–14.",
    "Engage HSE early — the incident module is the strongest adoption hook.",
    "Reserve 15% contingency in capex for offline-sync edge cases.",
  ],
  nextSteps: [
    "Confirm PMO sponsor and steerco cadence (week 1).",
    "Run 3–5 stakeholder interviews on adoption risk.",
    "Approve pilot site list and success KPIs.",
    "Kick off engineering sprint 1 with offline-first architecture spike.",
    "Schedule PDPL legal review at design completion.",
  ],
};
