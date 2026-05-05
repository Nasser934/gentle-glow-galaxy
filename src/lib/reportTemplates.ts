import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export type ReportType =
  | "healthcare_rpm"
  | "public_sector_data_exchange"
  | "generic_saas"
  | "ai_product"
  | "marketplace"
  | "fintech"
  | "enterprise_software";

export type Verdict = "Proceed" | "Conditional Proceed" | "Hold / Validate Further" | "Do Not Proceed";

export type ReportTemplate = {
  type: ReportType;
  label: string;
  coreTerms: string[];
  bannedTerms: string[];
  compliance: string[];
  risks: string[];
  gtmChannels: string[];
  diagrams: string[];
  recommendationRule: string;
};

export const REPORT_TEMPLATES: Record<ReportType, ReportTemplate> = {
  healthcare_rpm: {
    type: "healthcare_rpm",
    label: "Healthcare / RPM",
    coreTerms: ["HIPAA", "FDA/SaMD", "EHR integration", "device integration", "reimbursement", "clinical workflow", "patient adherence", "cybersecurity"],
    bannedTerms: ["inter-agency", "agency modernization", "justice-to-health", "finance-to-benefits", "central treasury", "GovTech buyers", "government outbound"],
    compliance: ["HIPAA", "FDA/SaMD classification", "patient consent", "clinical alert safety", "billing documentation", "SOC2 roadmap"],
    risks: ["HIPAA breach", "FDA/SaMD classification issue", "EHR integration delay", "device data reliability", "patient adherence below target", "clinician workflow rejection", "alert fatigue", "reimbursement capture failure"],
    gtmChannels: ["health system pilots", "specialty clinics", "payer/provider partnerships", "EHR marketplace", "device OEM partnerships"],
    diagrams: ["Product workflow", "Target RPM architecture", "Reimbursement flow", "Stakeholder value map", "Risk heatmap", "Phase-gate roadmap"],
    recommendationRule: "Default to Conditional Proceed until paid pilots prove provider willingness to pay, EHR/device integration feasibility, reimbursement capture and clinical adoption.",
  },
  public_sector_data_exchange: {
    type: "public_sector_data_exchange",
    label: "Public-sector / data exchange",
    coreTerms: ["FedRAMP", "agency adoption", "procurement", "data-sharing agreements", "legacy systems", "auditability"],
    bannedTerms: ["HIPAA reimbursement", "patient adherence", "clinician workflow", "RPM codes"],
    compliance: ["FedRAMP", "data-sharing agreements", "sovereign cloud", "audit logs", "procurement controls"],
    risks: ["agency adoption", "legacy integration", "policy shift", "security accreditation", "procurement delay"],
    gtmChannels: ["government outbound", "systems integrators", "cloud marketplace", "agency pilots"],
    diagrams: ["Data exchange workflow", "Public-sector architecture", "Procurement roadmap", "Risk heatmap"],
    recommendationRule: "Use Conditional Proceed unless procurement path, accreditation and agency sponsor are already validated.",
  },
  generic_saas: {
    type: "generic_saas",
    label: "Generic SaaS",
    coreTerms: ["ACV", "CAC", "churn", "LTV:CAC", "retention", "GTM", "product roadmap"],
    bannedTerms: [],
    compliance: ["SOC2", "privacy", "security review"],
    risks: ["CAC inflation", "churn", "low conversion", "implementation cost", "competition"],
    gtmChannels: ["enterprise outbound", "PLG expansion", "marketplace", "partners"],
    diagrams: ["SaaS funnel", "ARR bridge", "risk heatmap", "phase-gate roadmap"],
    recommendationRule: "Proceed only when unit economics and retention are validated.",
  },
  ai_product: {
    type: "ai_product",
    label: "AI product",
    coreTerms: ["model risk", "data readiness", "AI governance", "inference cost", "value realization", "human-in-the-loop"],
    bannedTerms: [],
    compliance: ["AI governance", "data privacy", "model monitoring", "responsible AI"],
    risks: ["model accuracy", "hallucination", "inference cost", "data quality", "AI governance gap"],
    gtmChannels: ["enterprise pilots", "workflow integration", "platform partnerships"],
    diagrams: ["AI workflow", "model governance", "value realization map", "risk heatmap"],
    recommendationRule: "Use gated validation until data readiness, model quality and value capture are proven.",
  },
  marketplace: {
    type: "marketplace",
    label: "Marketplace",
    coreTerms: ["liquidity", "supply", "demand", "take rate", "network effects", "retention"],
    bannedTerms: [],
    compliance: ["payments", "platform policies", "trust and safety"],
    risks: ["cold start", "low liquidity", "CAC", "supply quality", "trust issues"],
    gtmChannels: ["supply acquisition", "demand acquisition", "partnerships", "community loops"],
    diagrams: ["Marketplace flywheel", "liquidity curve", "unit economics", "risk heatmap"],
    recommendationRule: "Proceed only if one side of the marketplace can be seeded cheaply and retained.",
  },
  fintech: {
    type: "fintech",
    label: "FinTech",
    coreTerms: ["licensing", "fraud", "KYC", "AML", "payment rails", "compliance"],
    bannedTerms: [],
    compliance: ["KYC", "AML", "fraud controls", "licensing", "payment security"],
    risks: ["licensing delay", "fraud", "chargebacks", "payment rail dependency", "regulatory change"],
    gtmChannels: ["bank partnerships", "embedded finance", "direct sales", "developer channels"],
    diagrams: ["Payment flow", "compliance map", "unit economics", "risk heatmap"],
    recommendationRule: "Use Conditional Proceed until licensing, fraud controls and payment economics are validated.",
  },
  enterprise_software: {
    type: "enterprise_software",
    label: "Enterprise software",
    coreTerms: ["procurement", "integrations", "security", "implementation", "customer success", "renewals"],
    bannedTerms: [],
    compliance: ["SOC2", "SSO", "audit logs", "data privacy", "enterprise security review"],
    risks: ["long sales cycle", "implementation delay", "low adoption", "integration burden", "renewal risk"],
    gtmChannels: ["enterprise outbound", "systems integrators", "cloud marketplace", "customer expansion"],
    diagrams: ["Enterprise workflow", "architecture", "implementation roadmap", "risk heatmap"],
    recommendationRule: "Proceed only if security review, implementation cost and renewal path are credible.",
  },
};

export function detectReportType(inputs: ConceptInputs, report: FeasibilityReport): ReportType {
  const text = `${inputs.projectName} ${inputs.industry} ${inputs.businessModel} ${inputs.revenueModel} ${report.executiveSummary}`.toLowerCase();
  if (/remote patient|patient monitoring|rpm|healthcare|clinical|ehr|hipaa|patient/.test(text)) return "healthcare_rpm";
  if (/inter-agency|agency|public-sector|govtech|fedramp|data exchange|government/.test(text)) return "public_sector_data_exchange";
  if (/marketplace|supply|demand|take rate|network effect/.test(text)) return "marketplace";
  if (/fintech|payment|kyc|aml|fraud|banking/.test(text)) return "fintech";
  if (/ai|model|inference|agent|machine learning|genai/.test(text)) return "ai_product";
  if (/enterprise|implementation|procurement|integrations/.test(text)) return "enterprise_software";
  return "generic_saas";
}

export function getReportTemplate(inputs: ConceptInputs, report: FeasibilityReport): ReportTemplate {
  return REPORT_TEMPLATES[detectReportType(inputs, report)];
}

export function getRecommendation(overallScore: number, riskScore: number, type: ReportType): Verdict {
  if (type === "healthcare_rpm") return "Conditional Proceed";
  const highRisk = riskScore < 7;
  if (overallScore >= 8.5 && !highRisk) return "Proceed";
  if (overallScore >= 7) return "Conditional Proceed";
  if (overallScore >= 5.5) return "Hold / Validate Further";
  return "Do Not Proceed";
}

export function sanitizeForTemplate(text: string, template: ReportTemplate) {
  let output = text;
  if (template.type === "healthcare_rpm") {
    const replacements: Array<[RegExp, string]> = [
      [/inter-agency secure data exchange layer/gi, "HIPAA-compliant remote patient monitoring platform"],
      [/inter-agency data exchange/gi, "remote patient monitoring"],
      [/public-sector organisations?/gi, "health systems and provider groups"],
      [/public-sector and GovTech buyers/gi, "health systems, clinics and provider groups"],
      [/government outbound/gi, "health system pilot sales"],
      [/agency modernization programs/gi, "clinical workflow transformation programs"],
      [/justice-to-health or finance-to-benefits data flows/gi, "post-discharge and chronic-care workflows"],
      [/central treasury/gi, "provider billing and revenue-cycle teams"],
      [/agency-level adoption/gi, "department-level clinical adoption"],
      [/FedRAMP\/high-impact controls/gi, "HIPAA controls and SOC2 roadmap"],
      [/sovereign\/private cloud/gi, "HIPAA-ready cloud deployment"],
      [/government data exchange demand/gi, "remote patient monitoring demand"],
      [/regulated buyers/gi, "healthcare buyers"],
    ];
    replacements.forEach(([pattern, replacement]) => {
      output = output.replace(pattern, replacement);
    });
  }
  return output;
}
