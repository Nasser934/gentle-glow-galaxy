import type { ConceptInputs, FeasibilityReport, FMARTScores } from "@/types/analysis";
import { getRecommendation, REPORT_TEMPLATES, type ReportType } from "@/lib/reportTemplates";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => `USD ${Math.round(n).toLocaleString()}`;
const text = (inputs: ConceptInputs) => `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.knownRisks} ${inputs.regulatoryConsiderations}`;

type CopyPack = {
  thesis: string;
  market: [string, string, string];
  customer: [string, string, string, string, string];
  competitors: string[][];
  risks: string[][];
  recommendations: string[];
  nextSteps: string[];
  sourceNotes?: Array<{ title: string; source: string; url: string; takeaway: string }>;
};

function detect(inputs: ConceptInputs): ReportType {
  const t = text(inputs);
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare/i.test(t)) return "healthcare_rpm";
  if (/inter-agency|data exchange|government|public sector|agency|fedramp/i.test(t)) return "public_sector_data_exchange";
  if (/data insights|business intelligence|\bbi platform\b|analytics platform|data intelligence|enterprise analytics|real-time insights|decision intelligence|governed kpi|semantic layer|time-to-insight/i.test(t)) return "enterprise_data_insights";
  if (/marketplace|two-sided|supply.*demand/i.test(t)) return "marketplace";
  if (/fintech|payment|wallet|banking|lending|kyc|aml/i.test(t)) return "fintech";
  if (/\bai\b|agent|copilot|machine learning|prediction|model|automation/i.test(t)) return "ai_product";
  if (/enterprise|erp|management platform/i.test(t)) return "enterprise_software";
  return "generic_saas";
}

function midBudget(b: string) {
  if (b.includes("50,000 – $250,000")) return 150000;
  if (b.includes("250,000 – $1M")) return 625000;
  if (b.includes("$1M – $5M")) return 3000000;
  if (b.includes("$5M – $25M")) return 15000000;
  if (b.includes("> $25M")) return 35000000;
  return 75000;
}

const GENERIC: CopyPack = {
  thesis: "The opportunity is attractive, but scale funding should wait until paid pilots validate customer willingness to pay, implementation cost, retention and unit economics.",
  market: ["Cloud software market", "Reachable SME and mid-market segment", "Launchable serviceable market"],
  customer: ["SMEs and mid-market teams", "Software or operations budget", "Reduce manual work and fragmented tools", "USD 20k-100k ACV", "Pilot, security review, then expansion"],
  competitors: [
    ["Microsoft Teams", "Enterprise collaboration", "Workflow fragmentation", "Structured workflow and reporting layer"],
    ["Slack", "Messaging ecosystem", "Limited executive reporting", "Collaboration with decision-grade dashboards"],
    ["Notion", "Flexible workspace", "Enterprise controls gap", "Governed workspace and workflow platform"],
    ["Asana / Monday", "Project management", "Limited vertical workflow depth", "Industry-specific workflows and reporting"],
  ],
  risks: [
    ["High CAC", "Med", "High", "High", "Narrow the ICP and validate channels"],
    ["Churn", "Med", "High", "High", "Track activation and customer success"],
    ["Crowded market", "High", "Med", "High", "Win through a specific workflow wedge"],
    ["Integration burden", "Med", "Med", "Med", "Build top integrations first"],
  ],
  recommendations: ["Focus on a narrow ICP", "Validate paid conversion", "Prove retention", "Control CAC", "Prioritize buyer-critical integrations"],
  nextSteps: ["Run customer discovery", "Secure design partners", "Build MVP", "Launch paid pilots", "Measure retention"],
};

function copyFor(type: ReportType): CopyPack {
  if (type === "healthcare_rpm") return {
    thesis: "The RPM opportunity is attractive, but scale funding should wait until paid pilots prove provider adoption, EHR/device integration, reimbursement capture and clinical workflow usage.",
    market: ["Remote patient monitoring market", "Reachable provider groups", "Paid pilot and enterprise contract revenue"],
    customer: ["Health systems and provider groups", "RPM or care coordination budget", "Reduce readmissions and improve care continuity", "USD 50k-250k ACV", "Clinical pilot, security review, billing validation"],
    competitors: [["Medtronic", "Device ecosystem", "Device lock-in", "Vendor-neutral RPM"], ["Philips", "Hospital RPM", "Complex deployment", "Faster provider onboarding"], ["Dexcom / Abbott", "Device data", "Narrow disease focus", "Multi-condition monitoring"], ["Epic / Oracle Health", "EHR-native workflow", "Device flexibility gap", "Lightweight EHR-connected RPM layer"]],
    risks: [["HIPAA breach", "Med", "High", "High", "Encrypt PHI, RBAC and audit logs"], ["FDA/SaMD issue", "Med", "High", "High", "Regulatory assessment before MVP"], ["EHR integration delay", "High", "High", "High", "Start with one or two EHR paths"], ["Patient adherence", "Med", "Med", "Med", "Onboarding and reminders"], ["Reimbursement capture", "Med", "High", "High", "Validate billing workflow"]],
    recommendations: ["Start with post-discharge and chronic-care workflows", "Validate reimbursement before scaling", "Build EHR integration early", "Design for nurses and care coordinators", "Control alert fatigue", "Use paid pilots", "Build HIPAA controls from day one"],
    nextSteps: ["Run 20 provider interviews", "Secure 3 LOIs", "Validate one EHR path", "Confirm billing workflow", "Launch 3 paid pilots"],
  };
  if (type === "public_sector_data_exchange") return {
    thesis: "The public-sector data exchange opportunity is attractive, but execution depends on a lead agency sponsor, procurement route, accreditation path and legacy integration plan.",
    market: ["Secure data exchange market", "National agency data-sharing segment", "Reachable agency pilot and contract revenue"],
    customer: ["Public-sector agencies", "Digital government budget", "Improve secure data-sharing and auditability", "USD 250k-1M contract value", "Procurement, security review and sponsor approval"],
    competitors: [["Palantir", "Government analytics", "High price and black-box perception", "Open auditable exchange model"], ["IBM", "Enterprise data stack", "Complex implementation", "Modular API-first deployment"], ["Tyler Technologies", "Public-sector workflows", "Narrow segment focus", "Cross-agency exchange"], ["Oracle / Microsoft Government Cloud", "Cloud scale", "Customization burden", "Prebuilt agency workflows"]],
    risks: [["Agency adoption", "High", "High", "High", "Secure executive sponsor"], ["Accreditation delay", "Med", "High", "High", "Define security roadmap"], ["Legacy integration", "High", "Med", "High", "Prioritize top systems"], ["Procurement delay", "Med", "Med", "Med", "Validate route early"]],
    recommendations: ["Secure lead agency sponsor", "Validate data-sharing agreement templates", "Start with one high-value workflow", "Prioritize auditability", "Confirm procurement route"],
    nextSteps: ["Confirm sponsor", "Map procurement", "Define accreditation roadmap", "Pilot one workflow", "Measure adoption"],
  };
  if (type === "enterprise_data_insights") return {
    thesis: "Proceed only through a gated validation model. The opportunity is attractive because enterprises need faster, governed, real-time insights from fragmented data, but scale funding depends on paid pilots, integration cost validation, user adoption, differentiation against BI incumbents and proof of measurable time-to-insight improvement.",
    market: ["Global business intelligence and analytics market", "Enterprise BI and self-service analytics segment in North America and Europe", "Paid pilot and department-led expansion revenue"],
    customer: ["Mid-market and enterprise companies with fragmented data stacks", "COO, CFO, CIO or Data Office budget", "Reduce manual reporting, inconsistent KPIs and slow decision visibility", "USD 120k ACV target", "Department-led pilot, security review, data integration validation, then expansion"],
    competitors: [
      ["Microsoft Power BI", "Large Microsoft ecosystem and low entry cost", "Can require heavy modeling and governance work", "Faster time-to-insight through automated mapping, governed KPIs and action tracking"],
      ["Tableau", "Strong visualization and enterprise mindshare", "Dashboard-first experience can still leave action gaps", "Insight-to-action workflow with tracked decisions"],
      ["Looker", "Semantic modeling and Google Cloud alignment", "Technical setup can slow adoption", "Business-user KPI catalog and faster implementation"],
      ["Qlik", "Associative analytics and enterprise footprint", "Complexity for non-technical users", "Simpler governed metric layer and alerts"],
      ["ThoughtSpot", "Search and AI analytics", "May need mature data foundations", "Data quality checks and action workflow around insights"],
      ["Domo", "Integrated BI and apps", "Platform breadth can dilute focus", "Narrow wedge around executive time-to-insight"],
      ["Sigma Computing", "Cloud data warehouse-native analytics", "Depends on modern data stack maturity", "Broader connector and KPI governance layer"],
      ["Mode", "Analytics workflow for data teams", "Less executive action tracking", "Business action layer over analyst workflows"],
    ],
    risks: [
      ["Weak differentiation vs BI incumbents", "High", "High", "High", "Prove a measurable time-to-insight wedge against Power BI, Tableau and Looker"],
      ["Integration delays", "High", "High", "High", "Prioritize ERP, CRM and finance connectors with strict pilot scope"],
      ["Poor data quality", "High", "High", "High", "Add data quality checks, mapping rules and exception workflow"],
      ["Low user adoption", "Med", "High", "High", "Embed insights into executive and department routines"],
      ["High CAC", "Med", "High", "High", "Use narrow ICP and outcome-led pilots"],
      ["Dashboard fatigue", "Med", "Med", "Med", "Sell alerts, recommendations and action tracking, not more dashboards"],
      ["Low expansion revenue", "Med", "High", "High", "Define department expansion criteria before scale"],
      ["Security and privacy concern", "Med", "High", "High", "Implement SSO, RBAC, audit logs, encryption and SOC 2 roadmap"],
    ],
    recommendations: ["Focus the wedge on time-to-insight, not generic dashboards", "Start with one high-value use case such as executive performance, revenue operations, finance reporting or customer churn", "Build a governed KPI library and semantic layer early", "Automate data mapping to reduce implementation cost", "Integrate with the existing BI/data stack instead of replacing everything", "Sell business outcomes, not features", "Use paid pilots with measurable success criteria", "Track adoption, decision usage and time saved as core KPIs"],
    nextSteps: ["Run 20 interviews with CIO, CDO, CFO and COO buyers", "Select one use case and define baseline time-to-insight", "Validate ERP, CRM and finance data connectors", "Secure 3 paid pilots", "Measure adoption, CAC payback and expansion intent"],
    sourceNotes: [
      { title: "Magic Quadrant for Analytics and Business Intelligence Platforms", source: "Gartner", url: "https://www.gartner.com/en/documents/analytics-business-intelligence-platforms", takeaway: "Supports BI incumbent landscape and enterprise analytics category context." },
      { title: "Power BI official product page", source: "Microsoft", url: "https://powerbi.microsoft.com/", takeaway: "Supports Power BI competitor strength and Microsoft ecosystem position." },
      { title: "Tableau official product page", source: "Salesforce Tableau", url: "https://www.tableau.com/", takeaway: "Supports Tableau competitor positioning and visualization strength." },
      { title: "Looker official product page", source: "Google Cloud", url: "https://cloud.google.com/looker", takeaway: "Supports Looker semantic layer and Google Cloud positioning." },
      { title: "The data-driven enterprise of 2025", source: "McKinsey", url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-data-driven-enterprise-of-2025", takeaway: "Supports the need for faster data-driven decisions and operating-model change." },
    ],
  };
  return GENERIC;
}

function scoresFor(type: ReportType, inputs: ConceptInputs): FMARTScores {
  const early = /experimental|unknown|emerging/i.test(inputs.technologyReadiness);
  const riskInput = /breach|regulatory|compliance|integration|adoption|churn|competition/i.test(text(inputs));
  const financial = type === "healthcare_rpm" ? 7.2 : type === "enterprise_data_insights" ? 7.8 : 7.4;
  const market = type === "healthcare_rpm" ? 8.6 : type === "public_sector_data_exchange" ? 8.0 : type === "enterprise_data_insights" ? 9.0 : 8.2;
  const achievability = type === "enterprise_data_insights" ? 8.0 : early ? 7.0 : 8.0;
  const risk = Math.max(5.8, (type === "healthcare_rpm" ? 6.4 : type === "enterprise_data_insights" ? 6.8 : 6.8) - (riskInput ? 0.4 : 0));
  const timing = type === "healthcare_rpm" ? 8.4 : type === "enterprise_data_insights" ? 9.0 : 8.0;
  const operational = type === "enterprise_data_insights" ? 7.4 : early ? 7.0 : 7.8;
  const weights = { financial: 0.2, market: 0.2, achievability: 0.15, risk: 0.2, timing: 0.15, operational: 0.1 };
  const overall = Number((financial * weights.financial + market * weights.market + achievability * weights.achievability + risk * weights.risk + timing * weights.timing + operational * weights.operational).toFixed(1));
  const rec = getRecommendation(overall, risk, type);
  const isDataInsights = type === "enterprise_data_insights";
  return {
    financial, market, achievability, risk, timing, operational, overall,
    verdict: rec === "Proceed" ? "PROCEED" : rec === "Conditional Proceed" ? "PROCEED WITH CAUTION" : rec === "Hold / Validate Further" ? "REVISE" : "DO NOT PROCEED",
    financialFinding: isDataInsights ? "Financial feasibility depends on ACV, CAC, implementation cost, gross margin, retention, NRR and expansion revenue." : "Financial feasibility depends on ACV, implementation cost, CAC payback and retention.",
    marketFinding: isDataInsights ? "Demand is attractive due to enterprise data fragmentation, self-service analytics demand and governed KPI needs." : "Market demand is attractive, but market size does not prove willingness to pay.",
    achievabilityFinding: isDataInsights ? "Execution is feasible if data connectors, semantic layer, data quality and action workflow are scoped tightly." : "Technical feasibility is manageable if MVP scope stays narrow.",
    riskFinding: isDataInsights ? "Key risks are poor data quality, integration delays, weak differentiation versus BI incumbents and low user adoption." : "Risk is material and should be controlled through gates and named owners.",
    timingFinding: isDataInsights ? "Strong timing due to AI-enabled analytics, data democratization, real-time decisions and pressure to reduce manual reporting." : "Timing is favorable due to digitization pressure and buyer focus on productivity.",
    operationalFinding: isDataInsights ? "Operational readiness depends on integration delivery, data governance, customer success and business-user adoption." : "Operational readiness depends on ownership, implementation and customer success.",
    weights,
    confidence: { financial: 72, market: 75, achievability: 72, risk: 68, timing: 75, operational: 70 },
    rationale: {
      financial: "Base economics are plausible but need pilot validation.", market: "Demand drivers are credible but source validation is needed.", achievability: "The solution can be built with controlled integration scope.", risk: "Compliance, adoption and implementation risks reduce the risk score.", timing: "The entry window is credible.", operational: "Execution requires clear owners and customer success capacity.",
    },
  };
}

export function generateLocalReport(inputs: ConceptInputs): FeasibilityReport {
  const type = detect(inputs);
  const template = REPORT_TEMPLATES[type];
  const c = copyFor(type);
  const mid = midBudget(inputs.budgetRange);
  const low = Math.round(mid * 0.65);
  const high = Math.round(mid * 1.35);
  const monthly = Math.max(25000, Math.round(mid / 18));
  const scores = scoresFor(type, inputs);
  const citations = c.sourceNotes ?? [{ title: "Source validation required", source: "Local fallback", url: "", takeaway: "Replace with live research after Edge Function connectivity is fixed." }];
  return {
    reportId: `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dateIssued: today(), classification: "Confidential", preparedBy: "Concept AI local fallback", methodology: "FMART weighted feasibility scoring with template-aligned local fallback logic.",
    executiveSummary: `${c.thesis} This draft was generated locally because the analysis Edge Function is unreachable. Treat market figures as directional until live research is restored.`,
    narrative: { governingThesis: c.thesis, keyArguments: [{ argument: "Market", evidence: "Demand is directionally attractive.", implication: "Validate willingness to pay." }, { argument: "Economics", evidence: "Unit economics depend on ACV, CAC and retention.", implication: "Use paid pilots." }, { argument: "Execution", evidence: "Integration and adoption risks are material.", implication: "Release funding through gates." }], situation: "Market need is credible.", complication: "Execution risk can affect feasibility.", resolution: "Proceed through gated validation.", limitations: ["Generated locally", "Market data directional", "Sources need validation"] },
    scores,
    market: { currency: "USD", tamLabel: c.market[0], tamValue: money(mid * 50), tamCagr: "12-18%", samLabel: c.market[1], samValue: money(mid * 12), samCagr: "10-15%", somLabel: c.market[2], somValue: money(mid * 2), somCagr: "15-25%", growthChart: [{ year: "2026", tam: 1, sam: 0.25 }, { year: "2027", tam: 1.15, sam: 0.3 }, { year: "2028", tam: 1.32, sam: 0.36 }, { year: "2029", tam: 1.52, sam: 0.43 }, { year: "2030", tam: 1.75, sam: 0.52 }] },
    customer: { ageLocation: c.customer[0], income: c.customer[1], goals: c.customer[2], willingnessToPay: c.customer[3], behavior: c.customer[4] },
    competitors: c.competitors.map(([name, model, weakness, edge]) => ({ name, model, weakness, edge })),
    research: { overview: type === "enterprise_data_insights" ? "Directional synthesis for enterprise BI, governed KPI, semantic layer and real-time insight demand." : "Directional synthesis generated locally because the live Edge Function is unreachable.", confidence: "Low", sentiment: "Mixed", keySignals: ["Buyer pain appears credible", "Integration risk is material", "Differentiation must be narrow", "Paid pilots are needed"], painPoints: type === "enterprise_data_insights" ? ["Manual reporting", "Fragmented systems", "Inconsistent KPIs", "Slow decision visibility", "Dashboard fatigue"] : ["Manual work", "Fragmented systems", "Compliance pressure", "Adoption friction"], competitorMentions: c.competitors.map(([name]) => name), redditSignals: ["Community evidence unavailable in local fallback mode."], webSignals: ["Live web research unavailable in local fallback mode."], citations },
    financials: { currency: "USD", capExTotal: { low, mid, high }, capEx: [{ category: "Product development", low: low * 0.35, high: high * 0.35, notes: "MVP and workflows" }, { category: "Integrations", low: low * 0.2, high: high * 0.2, notes: "Priority integrations" }, { category: "Security and compliance", low: low * 0.15, high: high * 0.15, notes: "Controls and testing" }, { category: "GTM / pilots", low: low * 0.15, high: high * 0.15, notes: "Discovery and pilots" }, { category: "Contingency", low: low * 0.15, high: high * 0.15, notes: "Reserve" }], opEx: [{ category: "Engineering and product", monthly: monthly * 0.4, annual: monthly * 4.8 }, { category: "Cloud and tooling", monthly: monthly * 0.2, annual: monthly * 2.4 }, { category: "Customer success", monthly: monthly * 0.2, annual: monthly * 2.4 }, { category: "Sales and admin", monthly: monthly * 0.2, annual: monthly * 2.4 }], scenarios: [{ scenario: "Optimistic", probability: "25%", subscribersYr1: "15-25 customers", annualRevenue: money(mid * 1.2), breakEven: "Month 18-22" }, { scenario: "Base Case", probability: "55%", subscribersYr1: "8-12 customers", annualRevenue: money(mid * 0.65), breakEven: "Month 24-30" }, { scenario: "Pessimistic", probability: "20%", subscribersYr1: "3-5 customers", annualRevenue: money(mid * 0.25), breakEven: "Beyond Month 36" }], investmentRange: `${money(low)} - ${money(high)}`, breakEvenSummary: "Break-even depends on paid pilot conversion, implementation cost and retention.", ltvCacRatio: "Target >3:1 after validation" },
    risks: c.risks.map(([name, probability, impact, level, mitigation]) => ({ name, probability: probability as "Low" | "Med" | "High", impact: impact as "Low" | "Med" | "High", level: level as "Low" | "Med" | "High", mitigation })),
    fundingMix: [{ source: "Founder / internal funding", share: "25%", amount: money(low * 0.25), rationale: "Funds validation" }, { source: "Strategic / investor funding", share: "60%", amount: money(low * 0.6), rationale: "Funds MVP and pilots" }, { source: "Grants / partnerships", share: "15%", amount: money(low * 0.15), rationale: "Reduces risk" }],
    fundingAdvisory: `Use gated funding. ${template.recommendationRule}`,
    recommendations: c.recommendations,
    nextSteps: c.nextSteps,
    implementationRoadmap: { phases: [{ phase: "Discovery", timeline: "0-8 weeks", keyActivities: "Interviews and workflow map", decisionGate: "3 LOIs", successMetric: "Paid pilot interest" }, { phase: "MVP", timeline: "2-6 months", keyActivities: "Build narrow workflow", decisionGate: "Pilot-ready release", successMetric: "Core workflow usable" }, { phase: "Paid pilot", timeline: "6-12 months", keyActivities: "Run paid pilots", decisionGate: "3 paid pilots", successMetric: "NPS >35" }, { phase: "Scale", timeline: "12-24 months", keyActivities: "Expand channels", decisionGate: "CAC payback <18 months", successMetric: "Retention >90%" }] },
  };
}
