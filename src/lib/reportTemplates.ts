import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export type ReportType =
  | "healthcare_rpm"
  | "public_sector_data_exchange"
  | "enterprise_data_insights"
  | "customer_data_platform"
  | "identity_verification"
  | "enterprise_workflow"
  | "generic_saas"
  | "ai_product"
  | "marketplace"
  | "fintech"
  | "enterprise_software";

export type Verdict = "Proceed" | "Conditional Proceed" | "Hold / Validate Further" | "Do Not Proceed";
export type SourceQuality = "Primary" | "Expert" | "Market" | "Weak";

export type ReportTemplate = {
  type: ReportType;
  label: string;
  titleSignals: RegExp[];
  industrySignals: RegExp[];
  coreTerms: string[];
  bannedTerms: string[];
  sourceSignals: RegExp[];
  competitorSignals: RegExp[];
  compliance: string[];
  risks: string[];
  gtmChannels: string[];
  diagrams: string[];
  recommendationRule: string;
  scoreBoosters: string[];
  scoreReducers: string[];
};

export type TemplateValidationIssue = { severity: "error" | "warning"; field: string; message: string };
export type TemplateValidationResult = { reportType: ReportType; template: ReportTemplate; recommendation: Verdict; issues: TemplateValidationIssue[]; hasBlockingIssues: boolean };

const makeTemplate = (template: ReportTemplate) => template;

export const REPORT_TEMPLATES: Record<ReportType, ReportTemplate> = {
  healthcare_rpm: makeTemplate({
    type: "healthcare_rpm",
    label: "Healthcare / RPM",
    titleSignals: [/remote patient/i, /patient monitoring/i, /\brpm\b/i, /chronic care/i, /post-discharge/i],
    industrySignals: [/healthcare/i, /life sciences/i, /clinical/i, /provider/i, /hospital/i, /patient/i],
    coreTerms: ["HIPAA", "EHR integration", "device integration", "reimbursement", "clinical workflow", "patient adherence"],
    bannedTerms: ["inter-agency", "agency modernization", "GMV", "take rate", "anchor suppliers"],
    sourceSignals: [/cms/i, /fda/i, /hhs/i, /hipaa/i, /remote patient/i, /telehealth/i, /ehr/i, /clinical/i],
    competitorSignals: [/medtronic/i, /philips/i, /dexcom/i, /abbott/i, /epic/i, /oracle health/i],
    compliance: ["HIPAA", "FDA/SaMD", "patient consent", "clinical alert safety", "SOC 2"],
    risks: ["HIPAA breach", "EHR integration delay", "patient adherence", "alert fatigue", "reimbursement capture failure"],
    gtmChannels: ["health system pilots", "specialty clinics", "payer/provider partnerships", "EHR marketplace"],
    diagrams: ["RPM workflow", "clinical architecture", "risk heatmap", "roadmap"],
    recommendationRule: "Use Conditional Proceed until provider adoption, integration feasibility and clinical workflow usage are validated.",
    scoreBoosters: ["paid provider pilots", "validated reimbursement", "EHR path proven"],
    scoreReducers: ["EHR delay", "low patient adherence", "unclear SaMD classification"],
  }),
  public_sector_data_exchange: makeTemplate({
    type: "public_sector_data_exchange",
    label: "Public-sector data exchange",
    titleSignals: [/inter-agency/i, /data exchange/i, /secure data/i, /government data/i],
    industrySignals: [/public sector/i, /government/i, /govtech/i, /national/i, /agency/i],
    coreTerms: ["FedRAMP", "agency adoption", "procurement", "data-sharing agreements", "legacy systems", "auditability"],
    bannedTerms: ["patient adherence", "remote patient monitoring", "EHR integration", "GMV", "take rate"],
    sourceSignals: [/fedramp/i, /government/i, /agency/i, /procurement/i, /data exchange/i, /govtech/i],
    competitorSignals: [/palantir/i, /tyler/i, /ibm/i, /oracle/i, /microsoft azure government/i, /snowflake/i],
    compliance: ["FedRAMP", "data-sharing agreements", "sovereign cloud", "audit logs", "procurement controls"],
    risks: ["agency adoption", "legacy integration", "policy shift", "security accreditation", "procurement delay"],
    gtmChannels: ["agency pilots", "systems integrators", "cloud marketplace", "policy workshops"],
    diagrams: ["data exchange workflow", "public-sector architecture", "risk heatmap", "roadmap"],
    recommendationRule: "Use Conditional Proceed unless procurement path, accreditation and agency sponsor are validated.",
    scoreBoosters: ["named agency sponsor", "FedRAMP path", "procurement route"],
    scoreReducers: ["no lead agency", "security accreditation gap", "legacy blockers"],
  }),
  enterprise_data_insights: makeTemplate({
    type: "enterprise_data_insights",
    label: "Enterprise data insights / BI analytics",
    titleSignals: [/data insights/i, /business intelligence/i, /\bbi platform\b/i, /analytics platform/i, /enterprise analytics/i, /decision intelligence/i],
    industrySignals: [/business intelligence/i, /analytics/i, /data insights/i, /data platform/i, /enterprise data/i],
    coreTerms: ["business intelligence", "data ingestion", "data quality", "semantic layer", "governed KPIs", "self-service analytics", "time-to-insight"],
    bannedTerms: ["remote patient monitoring", "EHR integration", "GMV", "take rate", "anchor suppliers"],
    sourceSignals: [/business intelligence/i, /analytics/i, /data management/i, /power bi/i, /tableau/i, /looker/i, /gartner/i, /forrester/i, /idc/i],
    competitorSignals: [/power bi/i, /tableau/i, /looker/i, /qlik/i, /thoughtspot/i, /domo/i],
    compliance: ["SOC 2", "ISO 27001", "GDPR", "SSO", "RBAC", "audit logs"],
    risks: ["poor data quality", "integration delays", "weak differentiation", "high CAC", "long enterprise sales cycle"],
    gtmChannels: ["CIO/CDO outbound", "department pilots", "cloud marketplace", "data consulting partners"],
    diagrams: ["data workflow", "enterprise data architecture", "TAM/SAM/SOM", "risk heatmap"],
    recommendationRule: "Use Conditional Proceed until paid pilots prove integrations, time-to-insight improvement, ACV and retention.",
    scoreBoosters: ["3+ paid pilots", "core integrations", "time-to-insight improvement"],
    scoreReducers: ["integration cost", "low adoption", "BI incumbent pressure"],
  }),
  customer_data_platform: makeTemplate({
    type: "customer_data_platform",
    label: "Customer data platform",
    titleSignals: [/customer data platform/i, /\bcdp\b/i, /customer 360/i, /unified customer/i, /identity resolution/i, /first-party data/i],
    industrySignals: [/martech/i, /customer data/i, /customer intelligence/i, /personalization/i],
    coreTerms: ["CDP", "customer 360", "identity resolution", "consent management", "segmentation", "activation", "LTV"],
    bannedTerms: ["remote patient monitoring", "inter-agency", "GMV", "take rate"],
    sourceSignals: [/segment/i, /salesforce data cloud/i, /adobe/i, /tealium/i, /mparticle/i, /hightouch/i, /gdpr/i],
    competitorSignals: [/segment/i, /salesforce data cloud/i, /adobe/i, /tealium/i, /mparticle/i, /hightouch/i],
    compliance: ["GDPR", "CCPA", "SOC 2", "consent management", "data deletion", "audit logs"],
    risks: ["identity resolution failure", "poor data quality", "consent violation", "integration complexity"],
    gtmChannels: ["CMO/CDO outbound", "marketing operations pilots", "data consulting partners", "CRM partnerships"],
    diagrams: ["customer data flow", "identity graph", "activation workflow", "risk heatmap"],
    recommendationRule: "Use Conditional Proceed until identity resolution, privacy workflow, integrations, activation and CAC payback are validated.",
    scoreBoosters: ["identity accuracy", "core integrations", "activation use cases"],
    scoreReducers: ["consent gaps", "low activation", "high integration cost"],
  }),
  identity_verification: makeTemplate({
    type: "identity_verification",
    label: "Identity verification / security SaaS",
    titleSignals: [/identity verification/i, /digital identity/i, /id verification/i, /kyc/i, /aml/i, /liveness/i, /biometric/i],
    industrySignals: [/identity/i, /security/i, /compliance/i, /fintech/i, /e-commerce/i],
    coreTerms: ["KYC", "AML", "liveness detection", "document verification", "PII", "fraud reduction", "GDPR", "eIDAS", "audit logs"],
    bannedTerms: ["portfolio alpha", "investment committee", "GMV", "supplier liquidity", "anchor suppliers"],
    sourceSignals: [/identity verification/i, /kyc/i, /aml/i, /eid/i, /eidas/i, /fraud/i, /biometric/i],
    competitorSignals: [/onfido/i, /jumio/i, /persona/i, /id\.me/i, /trulioo/i, /sumsub/i],
    compliance: ["KYC/AML", "GDPR", "eIDAS", "SOC 2", "PII security", "data residency"],
    risks: ["data breach", "false rejection", "regulatory change", "high CAC", "competitor dominance"],
    gtmChannels: ["developer-led API pilots", "fintech/e-commerce pilots", "systems integrators", "cloud marketplace"],
    diagrams: ["verification workflow", "security architecture", "risk heatmap", "roadmap"],
    recommendationRule: "Use Conditional Proceed until security, compliance, verification quality, API adoption and paid pilots are validated.",
    scoreBoosters: ["low false rejection", "security certification", "paid pilots"],
    scoreReducers: ["privacy risk", "weak compliance", "CAC pressure"],
  }),
  enterprise_workflow: makeTemplate({
    type: "enterprise_workflow",
    label: "Enterprise workflow automation SaaS",
    titleSignals: [/workflow automation/i, /enterprise workflow/i, /workflow platform/i, /task assignment/i, /task tracking/i, /orchestration/i, /approval workflow/i],
    industrySignals: [/enterprise software/i, /software/i, /information technology/i, /automation/i, /workflow/i],
    coreTerms: ["workflow automation", "ERP integration", "HRIS integration", "SSO", "RBAC", "audit logs", "SOC 2", "customer success", "NRR"],
    bannedTerms: ["GMV", "take rate", "anchor suppliers", "supplier liquidity", "KYC/AML", "portfolio alpha"],
    sourceSignals: [/workflow automation/i, /enterprise software/i, /process automation/i, /asana/i, /monday/i, /jira/i, /servicenow/i],
    competitorSignals: [/monday/i, /jira/i, /servicenow/i, /asana/i, /salesforce/i, /workato/i, /zapier/i],
    compliance: ["SOC 2", "GDPR", "SSO", "RBAC", "audit logs", "data retention"],
    risks: ["long enterprise sales cycle", "implementation burden", "low adoption", "integration complexity", "security review failure"],
    gtmChannels: ["enterprise outbound", "systems integrators", "workflow pilots", "customer expansion"],
    diagrams: ["enterprise workflow", "integration architecture", "adoption funnel", "risk heatmap"],
    recommendationRule: "Proceed only if security review, implementation cost, adoption and renewal path are credible.",
    scoreBoosters: ["named buyer", "integration path", "security review", "customer success capacity"],
    scoreReducers: ["long sales cycle", "implementation burden", "weak adoption", "security review gaps"],
  }),
  generic_saas: makeTemplate({
    type: "generic_saas",
    label: "SaaS feasibility",
    titleSignals: [/saas/i, /software/i, /platform/i, /subscription/i],
    industrySignals: [/saas/i, /software/i, /technology/i, /cloud/i],
    coreTerms: ["ACV", "CAC", "churn", "LTV:CAC", "retention", "GTM", "roadmap"],
    bannedTerms: ["GMV", "take rate", "HIPAA", "FedRAMP"],
    sourceSignals: [/saas/i, /software/i, /cloud/i, /market/i],
    competitorSignals: [/microsoft/i, /google/i, /salesforce/i, /oracle/i, /atlassian/i],
    compliance: ["SOC 2", "privacy", "SSO", "RBAC", "security review"],
    risks: ["CAC inflation", "churn", "low conversion", "implementation cost", "competition"],
    gtmChannels: ["enterprise outbound", "PLG", "cloud marketplace", "partners"],
    diagrams: ["SaaS funnel", "ARR bridge", "risk heatmap", "roadmap"],
    recommendationRule: "Proceed only when unit economics, retention and differentiation are validated.",
    scoreBoosters: ["high activation", "low CAC", "retention"],
    scoreReducers: ["high churn", "weak differentiation", "crowded category"],
  }),
  ai_product: makeTemplate({
    type: "ai_product",
    label: "AI product feasibility",
    titleSignals: [/\bai\b/i, /agent/i, /copilot/i, /model/i, /automation/i],
    industrySignals: [/artificial intelligence/i, /machine learning/i, /genai/i],
    coreTerms: ["model risk", "data readiness", "AI governance", "inference cost", "human-in-the-loop"],
    bannedTerms: [],
    sourceSignals: [/ai/i, /machine learning/i, /llm/i, /governance/i],
    competitorSignals: [/openai/i, /anthropic/i, /microsoft copilot/i, /google/i],
    compliance: ["AI governance", "data privacy", "model monitoring", "responsible AI"],
    risks: ["model accuracy", "hallucination", "inference cost", "data quality"],
    gtmChannels: ["enterprise pilots", "workflow integration", "platform partnerships"],
    diagrams: ["AI workflow", "model governance", "value map", "risk heatmap"],
    recommendationRule: "Use gated validation until data readiness, model quality and value capture are proven.",
    scoreBoosters: ["high-quality data", "low inference cost", "productivity gain"],
    scoreReducers: ["poor data readiness", "weak governance", "no value tracking"],
  }),
  marketplace: makeTemplate({
    type: "marketplace",
    label: "B2B marketplace / procurement platform",
    titleSignals: [/marketplace/i, /b2b procurement platform/i, /supplier marketplace/i, /procurement marketplace/i, /two-sided/i, /rfq platform/i],
    industrySignals: [/marketplace/i, /b2b procurement/i, /sourcing marketplace/i, /commerce marketplace/i],
    coreTerms: ["liquidity", "supply", "demand", "take rate", "GMV", "network effects", "retention"],
    bannedTerms: ["workflow automation", "ERP/HRIS", "task assignment", "cross-departmental", "portfolio alpha"],
    sourceSignals: [/marketplace/i, /take rate/i, /supply/i, /demand/i, /b2b procurement/i],
    competitorSignals: [/tradeling/i, /moglix/i, /alibaba/i, /amazon business/i, /sap ariba/i],
    compliance: ["payments", "platform policies", "trust and safety", "tax invoicing"],
    risks: ["cold start", "low liquidity", "CAC", "supply quality", "trust issues"],
    gtmChannels: ["supply acquisition", "demand acquisition", "partnerships", "community loops"],
    diagrams: ["marketplace flywheel", "liquidity curve", "unit economics", "risk heatmap"],
    recommendationRule: "Proceed only if one side of the marketplace can be seeded cheaply and retained.",
    scoreBoosters: ["reliable supply", "repeat demand", "low CAC", "take rate"],
    scoreReducers: ["cold-start risk", "weak liquidity", "trust friction"],
  }),
  fintech: makeTemplate({
    type: "fintech",
    label: "FinTech",
    titleSignals: [/fintech/i, /payment/i, /wallet/i, /banking/i, /lending/i],
    industrySignals: [/financial/i, /fintech/i, /banking/i, /payments/i],
    coreTerms: ["licensing", "fraud", "KYC", "AML", "payment rails", "compliance"],
    bannedTerms: [],
    sourceSignals: [/fintech/i, /payments/i, /bank/i, /kyc/i, /aml/i],
    competitorSignals: [/stripe/i, /paypal/i, /square/i, /adyen/i, /wise/i],
    compliance: ["KYC", "AML", "fraud controls", "licensing", "payment security"],
    risks: ["licensing delay", "fraud", "chargebacks", "payment rail dependency"],
    gtmChannels: ["bank partnerships", "embedded finance", "direct sales", "developer channels"],
    diagrams: ["payment flow", "compliance map", "unit economics", "risk heatmap"],
    recommendationRule: "Use Conditional Proceed until licensing, fraud controls and payment economics are validated.",
    scoreBoosters: ["licensing path", "low fraud", "reliable rails"],
    scoreReducers: ["licensing delay", "fraud exposure", "chargebacks"],
  }),
  enterprise_software: makeTemplate({
    type: "enterprise_software",
    label: "Enterprise software",
    titleSignals: [/enterprise software/i, /management platform/i, /enterprise platform/i],
    industrySignals: [/enterprise/i, /software/i, /it/i],
    coreTerms: ["procurement", "integrations", "security", "implementation", "customer success", "renewals"],
    bannedTerms: ["GMV", "take rate", "anchor suppliers"],
    sourceSignals: [/enterprise/i, /software/i, /security/i, /implementation/i],
    competitorSignals: [/salesforce/i, /servicenow/i, /oracle/i, /sap/i, /snowflake/i],
    compliance: ["SOC 2", "SSO", "audit logs", "data privacy", "enterprise security review"],
    risks: ["long sales cycle", "implementation delay", "low adoption", "integration burden", "renewal risk"],
    gtmChannels: ["enterprise outbound", "systems integrators", "cloud marketplace", "customer expansion"],
    diagrams: ["enterprise workflow", "architecture", "roadmap", "risk heatmap"],
    recommendationRule: "Proceed only if security review, implementation cost and renewal path are credible.",
    scoreBoosters: ["named buyer", "integration path", "security review"],
    scoreReducers: ["long sales cycle", "implementation burden", "weak renewal"],
  }),
};

function countMatches(patterns: RegExp[], text: string) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function detectExplicitDomain(text: string): ReportType | null {
  if (/remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|clinical/.test(text)) return "healthcare_rpm";
  if (/inter-agency|secure data exchange|government data|public sector|agency|fedramp|sovereign cloud|govtech/.test(text)) return "public_sector_data_exchange";
  if (/identity verification|digital identity|id verification|liveness|biometric|eidas|kyc|aml|fraud reduction/.test(text)) return "identity_verification";
  if (/customer data platform|\bcdp\b|customer 360|unified customer|identity resolution|first-party data/.test(text)) return "customer_data_platform";
  if (/workflow automation|enterprise workflow|task assignment|task tracking|cross-departmental|orchestration|erp\/hris|approval workflow|work about work/.test(text)) return "enterprise_workflow";
  if (/data insights|business intelligence|\bbi platform\b|enterprise analytics|semantic layer|time-to-insight/.test(text)) return "enterprise_data_insights";
  if (/marketplace|b2b procurement platform|procurement marketplace|supplier marketplace|rfq platform|gmv|take rate/.test(text)) return "marketplace";
  return null;
}

export function detectReportType(inputs: ConceptInputs, report: FeasibilityReport): ReportType {
  const userText = `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.assumptions} ${inputs.knownRisks} ${inputs.regulatoryConsiderations}`.toLowerCase();
  const explicit = detectExplicitDomain(userText);
  if (explicit) return explicit;

  const title = `${inputs.projectName}`.toLowerCase();
  const industry = `${inputs.industry} ${inputs.location}`.toLowerCase();
  const body = `${inputs.description} ${report.executiveSummary}`.toLowerCase();
  const ranked = Object.values(REPORT_TEMPLATES)
    .map((template) => ({ type: template.type, score: countMatches(template.titleSignals, title) * 14 + countMatches(template.industrySignals, industry) * 5 + countMatches(template.titleSignals, body) * 4 + countMatches(template.industrySignals, body) * 2 }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].type : "generic_saas";
}

export function getReportTemplate(inputs: ConceptInputs, report: FeasibilityReport): ReportTemplate {
  return REPORT_TEMPLATES[detectReportType(inputs, report)];
}

export function getRecommendation(overallScore: number, riskScore: number, type: ReportType): Verdict {
  if (["healthcare_rpm", "enterprise_data_insights", "customer_data_platform", "identity_verification", "public_sector_data_exchange"].includes(type)) return overallScore >= 8.7 && riskScore >= 8 ? "Proceed" : "Conditional Proceed";
  const highRisk = riskScore < 7;
  if (overallScore >= 8.5 && !highRisk) return "Proceed";
  if (overallScore >= 7) return "Conditional Proceed";
  if (overallScore >= 5.5) return "Hold / Validate Further";
  return "Do Not Proceed";
}

export function sourceQuality(source = "", title = ""): SourceQuality {
  const value = `${source} ${title}`.toLowerCase();
  if (/\.gov|official|annual report|10-k|company|microsoft|google|salesforce|adobe|atlassian|servicenow|stripe|onfido|jumio|persona/.test(value)) return "Primary";
  if (/mckinsey|bcg|bain|deloitte|gartner|forrester|academic|journal|idc/.test(value)) return "Expert";
  if (/market|research|insights|grand view|marketsandmarkets|statista|mordor|researchandmarkets|tavily/.test(value)) return "Market";
  return "Weak";
}

export function sanitizeForTemplate(text: string, template: ReportTemplate) {
  let output = text;
  template.bannedTerms.forEach((term) => {
    output = output.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "sector-specific validation");
  });
  return output;
}

function isWeakSourceOnly(report: FeasibilityReport) {
  const citations = report.research?.citations ?? [];
  return citations.length > 0 && citations.every((c) => sourceQuality(c.source, c.title) === "Weak");
}

export function validateTemplateIntegrity(inputs: ConceptInputs, report: FeasibilityReport): TemplateValidationResult {
  const template = getReportTemplate(inputs, report);
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  const competitorText = (report.competitors || []).map((c) => `${c.name} ${c.model} ${c.edge} ${c.weakness}`).join(" ").toLowerCase();
  const sourceText = (report.research?.citations || []).map((c) => `${c.source} ${c.title} ${c.takeaway}`).join(" ").toLowerCase();
  const fullText = `${inputs.projectName} ${inputs.industry} ${inputs.description} ${report.executiveSummary} ${competitorText} ${sourceText}`.toLowerCase();
  const issues: TemplateValidationIssue[] = [];

  template.bannedTerms.forEach((term) => {
    if (fullText.includes(term.toLowerCase())) issues.push({ severity: "warning", field: "bannedTerms", message: `Possible wrong-template term found: ${term}` });
  });
  if ((report.research?.citations?.length || 0) === 0) issues.push({ severity: "warning", field: "sources", message: "No external sources are attached." });
  else if (isWeakSourceOnly(report)) issues.push({ severity: "warning", field: "sources", message: "Only weak sources are present." });
  if ((report.competitors?.length || 0) === 0) issues.push({ severity: "warning", field: "competitors", message: "Competitor set is empty." });

  return { reportType: template.type, template, recommendation, issues, hasBlockingIssues: false };
}
