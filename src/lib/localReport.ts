import type { ConceptInputs, FeasibilityReport, FMARTScores } from "@/types/analysis";
import { getRecommendation, REPORT_TEMPLATES, type ReportType } from "@/lib/reportTemplates";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => `USD ${Math.round(n).toLocaleString()}`;
const text = (inputs: ConceptInputs) => `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.knownRisks} ${inputs.regulatoryConsiderations}`;

function detect(inputs: ConceptInputs): ReportType {
  const t = text(inputs);
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare/i.test(t)) return "healthcare_rpm";
  if (/inter-agency|data exchange|government|public sector|agency|fedramp/i.test(t)) return "public_sector_data_exchange";
  if (/marketplace|two-sided|supply.*demand/i.test(t)) return "marketplace";
  if (/fintech|payment|wallet|banking|lending|kyc|aml/i.test(t)) return "fintech";
  if (/\bai\b|agent|copilot|machine learning|prediction|model|automation/i.test(t)) return "ai_product";
  if (/enterprise|erp|analytics platform|data platform|management platform/i.test(t)) return "enterprise_software";
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

const GENERIC = {
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

function copyFor(type: ReportType) {
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
  return GENERIC;
}

function scoresFor(type: ReportType, inputs: ConceptInputs): FMARTScores {
  const early = /experimental|unknown|emerging/i.test(inputs.technologyReadiness);
  const riskInput = /breach|regulatory|compliance|integration|adoption|churn|competition/i.test(text(inputs));
  const financial = type === "healthcare_rpm" ? 7.2 : 7.4;
  const market = type === "healthcare_rpm" ? 8.6 : type === "public_sector_data_exchange" ? 8.0 : 8.2;
  const achievability = early ? 7.0 : 8.0;
  const risk = Math.max(5.8, (type === "healthcare_rpm" ? 6.4 : 6.8) - (riskInput ? 0.4 : 0));
  const timing = type === "healthcare_rpm" ? 8.4 : 8.0;
  const operational = early ? 7.0 : 7.8;
  const weights = { financial: 0.2, market: 0.2, achievability: 0.15, risk: 0.2, timing: 0.15, operational: 0.1 };
  const overall = Number((financial * weights.financial + market * weights.market + achievability * weights.achievability + risk * weights.risk + timing * weights.timing + operational * weights.operational).toFixed(1));
  const rec = getRecommendation(overall, risk, type);
  return {
    financial, market, achievability, risk, timing, operational, overall,
    verdict: rec === "Proceed" ? "PROCEED" : rec === "Conditional Proceed" ? "PROCEED WITH CAUTION" : rec === "Hold / Validate Further" ? "REVISE" : "DO NOT PROCEED",
    financialFinding: "Financial feasibility depends on ACV, implementation cost, CAC payback and retention.",
    marketFinding: "Market demand is attractive, but market size does not prove willingness to pay.",
    achievabilityFinding: "Technical feasibility is manageable if MVP scope stays narrow.",
    riskFinding: "Risk is material and should be controlled through gates and named owners.",
    timingFinding: "Timing is favorable due to digitization pressure and buyer focus on productivity.",
    operationalFinding: "Operational readiness depends on ownership, implementation and customer success.",
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
  return {
    reportId: `FSB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    dateIssued: today(), classification: "Confidential", preparedBy: "Concept AI local fallback", methodology: "FMART weighted feasibility scoring with template-aligned local fallback logic.",
    executiveSummary: `${c.thesis} This draft was generated locally because the analysis Edge Function is unreachable. Treat market figures as directional until live research is restored.`,
    narrative: { governingThesis: c.thesis, keyArguments: [{ argument: "Market", evidence: "Demand is directionally attractive.", implication: "Validate willingness to pay." }, { argument: "Economics", evidence: "Unit economics depend on ACV, CAC and retention.", implication: "Use paid pilots." }, { argument: "Execution", evidence: "Integration and adoption risks are material.", implication: "Release funding through gates." }], situation: "Market need is credible.", complication: "Execution risk can affect feasibility.", resolution: "Proceed through gated validation.", limitations: ["Generated locally", "Market data directional", "Sources need validation"] },
    scores,
    market: { currency: "USD", tamLabel: c.market[0], tamValue: money(mid * 50), tamCagr: "12-18%", samLabel: c.market[1], samValue: money(mid * 12), samCagr: "10-15%", somLabel: c.market[2], somValue: money(mid * 2), somCagr: "15-25%", growthChart: [{ year: "2026", tam: 1, sam: 0.25 }, { year: "2027", tam: 1.15, sam: 0.3 }, { year: "2028", tam: 1.32, sam: 0.36 }, { year: "2029", tam: 1.52, sam: 0.43 }, { year: "2030", tam: 1.75, sam: 0.52 }] },
    customer: { ageLocation: c.customer[0], income: c.customer[1], goals: c.customer[2], willingnessToPay: c.customer[3], behavior: c.customer[4] },
    competitors: c.competitors.map(([name, model, weakness, edge]) => ({ name, model, weakness, edge })),
    research: { overview: "Directional synthesis generated locally because the live Edge Function is unreachable.", confidence: "Low", sentiment: "Mixed", keySignals: ["Buyer pain appears credible", "Integration risk is material", "Differentiation must be narrow", "Paid pilots are needed"], painPoints: ["Manual work", "Fragmented systems", "Compliance pressure", "Adoption friction"], competitorMentions: c.competitors.map(([name]) => name), redditSignals: ["Community evidence unavailable in local fallback mode."], webSignals: ["Live web research unavailable in local fallback mode."], citations: [{ title: "Source validation required", source: "Local fallback", url: "", takeaway: "Replace with live research after Edge Function connectivity is fixed." }] },
    financials: { currency: "USD", capExTotal: { low, mid, high }, capEx: [{ category: "Product development", low: low * 0.35, high: high * 0.35, notes: "MVP and workflows" }, { category: "Integrations", low: low * 0.2, high: high * 0.2, notes: "Priority integrations" }, { category: "Security and compliance", low: low * 0.15, high: high * 0.15, notes: "Controls and testing" }, { category: "GTM / pilots", low: low * 0.15, high: high * 0.15, notes: "Discovery and pilots" }, { category: "Contingency", low: low * 0.15, high: high * 0.15, notes: "Reserve" }], opEx: [{ category: "Engineering and product", monthly: monthly * 0.4, annual: monthly * 4.8 }, { category: "Cloud and tooling", monthly: monthly * 0.2, annual: monthly * 2.4 }, { category: "Customer success", monthly: monthly * 0.2, annual: monthly * 2.4 }, { category: "Sales and admin", monthly: monthly * 0.2, annual: monthly * 2.4 }], scenarios: [{ scenario: "Optimistic", probability: "25%", subscribersYr1: "15-25 customers", annualRevenue: money(mid * 1.2), breakEven: "Month 18-22" }, { scenario: "Base Case", probability: "55%", subscribersYr1: "8-12 customers", annualRevenue: money(mid * 0.65), breakEven: "Month 24-30" }, { scenario: "Pessimistic", probability: "20%", subscribersYr1: "3-5 customers", annualRevenue: money(mid * 0.25), breakEven: "Beyond Month 36" }], investmentRange: `${money(low)} - ${money(high)}`, breakEvenSummary: "Break-even depends on paid pilot conversion, implementation cost and retention.", ltvCacRatio: "Target >3:1 after validation" },
    risks: c.risks.map(([name, probability, impact, level, mitigation]) => ({ name, probability: probability as "Low" | "Med" | "High", impact: impact as "Low" | "Med" | "High", level: level as "Low" | "Med" | "High", mitigation })),
    fundingMix: [{ source: "Founder / internal funding", share: "25%", amount: money(low * 0.25), rationale: "Funds validation" }, { source: "Strategic / investor funding", share: "60%", amount: money(low * 0.6), rationale: "Funds MVP and pilots" }, { source: "Grants / partnerships", share: "15%", amount: money(low * 0.15), rationale: "Reduces risk" }],
    fundingAdvisory: `Use gated funding. ${template.recommendationRule}`,
    recommendations: c.recommendations,
    nextSteps: c.nextSteps,
    implementationRoadmap: { phases: [{ phase: "Discovery", timeline: "0-8 weeks", keyActivities: "Interviews and workflow map", decisionGate: "3 LOIs", successMetric: "Paid pilot interest" }, { phase: "MVP", timeline: "2-6 months", keyActivities: "Build narrow workflow", decisionGate: "Pilot-ready release", successMetric: "Core workflow usable" }, { phase: "Paid pilot", timeline: "6-12 months", keyActivities: "Run paid pilots", decisionGate: "3 paid pilots", successMetric: "NPS >35" }, { phase: "Scale", timeline: "12-24 months", keyActivities: "Expand channels", decisionGate: "CAC payback <18 months", successMetric: "Retention >90%" }] },
  };
}
