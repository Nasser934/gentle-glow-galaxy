import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export type ReportType =
  | "healthcare_rpm"
  | "public_sector_data_exchange"
  | "enterprise_data_insights"
  | "customer_data_platform"
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

export const REPORT_TEMPLATES: Record<ReportType, ReportTemplate> = {
  healthcare_rpm: {
    type: "healthcare_rpm",
    label: "Healthcare / RPM",
    titleSignals: [/remote patient/i, /patient monitoring/i, /\brpm\b/i, /chronic care/i, /post-discharge/i],
    industrySignals: [/healthcare/i, /life sciences/i, /clinical/i, /provider/i, /hospital/i, /patient/i],
    coreTerms: ["HIPAA", "FDA/SaMD", "EHR integration", "device integration", "reimbursement", "clinical workflow", "patient adherence", "cybersecurity"],
    bannedTerms: ["inter-agency", "agency modernization", "justice-to-health", "finance-to-benefits", "central treasury", "GovTech buyers", "government outbound", "agency-level adoption", "cloud collaboration SaaS"],
    sourceSignals: [/cms/i, /fda/i, /hhs/i, /hipaa/i, /remote patient/i, /rpm/i, /telehealth/i, /ehr/i, /medicare/i, /clinical/i],
    competitorSignals: [/medtronic/i, /philips/i, /dexcom/i, /abbott/i, /vivify/i, /optum/i, /epic/i, /cerner/i, /oracle health/i],
    compliance: ["HIPAA", "FDA/SaMD classification", "patient consent", "clinical alert safety", "billing documentation", "SOC2 roadmap"],
    risks: ["HIPAA breach", "FDA/SaMD classification issue", "EHR integration delay", "device data reliability", "patient adherence below target", "clinician workflow rejection", "alert fatigue", "reimbursement capture failure"],
    gtmChannels: ["health system pilots", "specialty clinics", "payer/provider partnerships", "EHR marketplace", "device OEM partnerships"],
    diagrams: ["Product workflow", "Target RPM architecture", "Reimbursement flow", "Stakeholder value map", "Risk heatmap", "Phase-gate roadmap"],
    recommendationRule: "Default to Conditional Proceed until paid pilots prove provider willingness to pay, EHR/device integration feasibility, reimbursement capture and clinical adoption.",
    scoreBoosters: ["Paid pilots with provider groups", "Validated reimbursement workflow", "EHR integration path proven", "Clinician weekly active usage above 70%"],
    scoreReducers: ["EHR integration delays", "Low patient adherence", "Unclear FDA/SaMD classification", "Weak reimbursement capture"],
  },
  public_sector_data_exchange: {
    type: "public_sector_data_exchange",
    label: "Public-sector / data exchange",
    titleSignals: [/inter-agency/i, /data exchange/i, /secure data/i, /government data/i],
    industrySignals: [/public sector/i, /government/i, /govtech/i, /national/i, /agency/i],
    coreTerms: ["FedRAMP", "agency adoption", "procurement", "data-sharing agreements", "legacy systems", "auditability"],
    bannedTerms: ["RPM reimbursement", "patient adherence", "clinician workflow", "remote patient monitoring", "post-discharge", "chronic-care", "cloud collaboration SaaS"],
    sourceSignals: [/fedramp/i, /government/i, /public sector/i, /agency/i, /procurement/i, /data exchange/i, /govtech/i],
    competitorSignals: [/palantir/i, /tyler/i, /ibm/i, /oracle/i, /microsoft azure government/i, /snowflake/i],
    compliance: ["FedRAMP", "data-sharing agreements", "sovereign cloud", "audit logs", "procurement controls"],
    risks: ["agency adoption", "legacy integration", "policy shift", "security accreditation", "procurement delay"],
    gtmChannels: ["government outbound", "systems integrators", "cloud marketplace", "agency pilots"],
    diagrams: ["Data exchange workflow", "Public-sector architecture", "Procurement roadmap", "Risk heatmap"],
    recommendationRule: "Use Conditional Proceed unless procurement path, accreditation and agency sponsor are already validated.",
    scoreBoosters: ["Named agency sponsor", "Data-sharing agreement path", "FedRAMP path confirmed", "Procurement route validated"],
    scoreReducers: ["No lead agency", "Procurement delay", "Security accreditation gap", "Legacy integration blockers"],
  },
  enterprise_data_insights: {
    type: "enterprise_data_insights",
    label: "Enterprise data insights / BI analytics",
    titleSignals: [/data insights/i, /business intelligence/i, /\bbi platform\b/i, /analytics platform/i, /data intelligence/i, /enterprise analytics/i, /real-time insights/i, /decision intelligence/i],
    industrySignals: [/business intelligence/i, /analytics/i, /data insights/i, /data platform/i, /data intelligence/i, /decision intelligence/i, /enterprise data/i],
    coreTerms: ["business intelligence", "data insights", "analytics platform", "data ingestion", "data quality", "semantic layer", "governed KPIs", "metric catalog", "self-service analytics", "real-time insights", "dashboard", "alerts", "recommendations", "data governance", "data connectors", "ERP", "CRM", "data warehouse", "decision intelligence", "time-to-insight"],
    bannedTerms: ["remote patient monitoring", "RPM", "EHR integration", "FHIR/HL7", "patient adherence", "care team", "FDA/SaMD", "reimbursement capture", "billing documentation", "inter-agency", "public-sector data exchange", "justice-to-health", "central treasury", "team chat", "video meetings", "document collaboration as core product", "cloud collaboration SaaS"],
    sourceSignals: [/business intelligence/i, /analytics/i, /data management/i, /data governance/i, /self-service analytics/i, /power bi/i, /tableau/i, /looker/i, /gartner/i, /forrester/i, /idc/i],
    competitorSignals: [/power bi/i, /tableau/i, /looker/i, /qlik/i, /thoughtspot/i, /domo/i, /sigma/i, /mode/i],
    compliance: ["SOC 2", "ISO 27001", "GDPR", "CCPA", "SSO", "RBAC", "audit logs", "data access controls", "data retention", "data residency"],
    risks: ["poor data quality", "integration delays", "weak differentiation vs BI incumbents", "high CAC", "long enterprise sales cycle", "low user adoption", "weak data governance", "dashboard fatigue", "security and privacy concern", "low expansion revenue", "custom implementation overload", "low retention"],
    gtmChannels: ["enterprise outbound to CIO/CDO/COO/CFO", "department-led land and expand", "BI modernization campaigns", "cloud marketplace", "data consulting partners", "executive dashboard pilots"],
    diagrams: ["data insight workflow", "enterprise data architecture", "TAM/SAM/SOM funnel", "competitor wedge map", "unit economics bridge", "risk heatmap", "phase-gate roadmap"],
    recommendationRule: "Default to Conditional Proceed. Proceed only after 3+ paid pilots, validated integrations, time-to-insight improvement, ACV validation, CAC payback below 18 months, retention signals and a clear wedge against Power BI, Tableau and Looker.",
    scoreBoosters: ["3+ paid pilots signed", "Core integrations validated", "Time-to-insight improvement proven", "ACV validated", "CAC payback below 18 months", "Retention and expansion signals proven"],
    scoreReducers: ["Integration cost rises", "Low adoption", "Power BI/Tableau pressure increases", "Poor source data quality", "CAC payback exceeds target", "Expansion revenue underperforms"],
  },
  customer_data_platform: {
    type: "customer_data_platform",
    label: "Customer data platform / Unified customer profile",
    titleSignals: [/unified customer profile/i, /customer data platform/i, /\bcdp\b/i, /customer 360/i, /customer profile/i, /customer data unification/i, /identity resolution/i, /first-party data/i, /segmentation/i, /activation/i, /customer intelligence/i, /customer journey/i, /personalization/i],
    industrySignals: [/customer data/i, /marketing technology/i, /martech/i, /customer intelligence/i, /customer 360/i, /first-party data/i, /personalization/i, /retention/i],
    coreTerms: ["customer data platform", "CDP", "unified customer profile", "customer 360", "identity resolution", "profile unification", "first-party data", "consent management", "GDPR", "CCPA", "segmentation", "activation", "reverse ETL", "data ingestion", "event tracking", "CRM", "email platform", "support platform", "billing system", "product analytics", "data quality", "customer journey", "retention", "churn", "LTV", "personalization"],
    bannedTerms: ["cloud collaboration SaaS", "team collaboration", "video meetings", "document collaboration", "workspace as core product", "Microsoft Teams", "Slack", "Notion", "Asana", "Monday", "inter-agency", "public-sector data exchange", "remote patient monitoring", "EHR integration", "FDA/SaMD", "reimbursement capture", "care team", "clinical workflow"],
    sourceSignals: [/customer data platform/i, /\bcdp\b/i, /segment/i, /salesforce data cloud/i, /adobe real-time cdp/i, /tealium/i, /mparticle/i, /treasure data/i, /hightouch/i, /rudderstack/i, /actioniq/i, /blueconic/i, /gdpr/i, /ccpa/i, /first-party data/i, /martech/i],
    competitorSignals: [/segment/i, /salesforce data cloud/i, /adobe real-time cdp/i, /tealium/i, /mparticle/i, /treasure data/i, /hightouch/i, /rudderstack/i, /actioniq/i, /blueconic/i, /customer insights/i],
    compliance: ["GDPR", "CCPA", "SOC 2", "ISO 27001", "consent management", "data retention", "data deletion", "DSAR support", "SSO", "RBAC", "audit logs", "encryption", "data residency"],
    risks: ["data breach", "identity resolution failure", "poor data quality", "GDPR/CCPA consent violation", "integration complexity", "weak differentiation vs CDP incumbents", "high CAC", "long enterprise sales cycle", "low activation", "low retention", "weak expansion revenue", "data latency", "customer trust issue", "over-customization", "implementation margin erosion"],
    gtmChannels: ["enterprise outbound to CMO/CDO/CIO", "marketing operations-led pilots", "customer success use-case pilots", "data consulting partners", "cloud marketplace", "CRM and marketing automation partnerships"],
    diagrams: ["customer data flow", "identity resolution architecture", "customer 360 profile model", "activation workflow", "consent and privacy workflow", "TAM/SAM/SOM funnel", "unit economics bridge", "risk heatmap", "phase-gate roadmap"],
    recommendationRule: "Default to Conditional Proceed. Proceed only after 3+ paid pilots, identity resolution accuracy, core CRM/email/support/billing integrations, GDPR/CCPA consent workflow, activation use cases, ACV validation, CAC payback below 18 months and a clear wedge against Segment, Salesforce Data Cloud and Adobe Real-Time CDP.",
    scoreBoosters: ["3+ paid pilots signed", "Identity resolution accuracy validated", "Core integrations validated", "Consent workflow validated", "Activation use cases proven", "ACV validated", "CAC payback below 18 months"],
    scoreReducers: ["Identity resolution fails", "Consent workflow gaps", "Integration cost rises", "Low activation", "Weak differentiation vs CDP incumbents", "CAC payback exceeds target", "Retention below target"],
  },
  generic_saas: {
    type: "generic_saas",
    label: "Generic SaaS / cloud collaboration",
    titleSignals: [/cloud collaboration/i, /collaboration platform/i, /team workspace/i, /productivity platform/i, /workflow platform/i],
    industrySignals: [/saas/i, /software/i, /collaboration/i, /productivity/i, /cloud/i],
    coreTerms: ["ACV", "CAC", "churn", "LTV:CAC", "retention", "GTM", "product roadmap"],
    bannedTerms: ["HIPAA", "FDA/SaMD", "RPM reimbursement", "patient adherence", "inter-agency", "justice-to-health", "central treasury", "customer data platform", "identity resolution", "unified customer profile"],
    sourceSignals: [/saas/i, /collaboration/i, /productivity/i, /workspace/i, /slack/i, /microsoft teams/i, /zoom/i, /notion/i],
    competitorSignals: [/microsoft teams/i, /slack/i, /zoom/i, /notion/i, /asana/i, /monday/i, /google workspace/i],
    compliance: ["SOC2", "privacy", "security review"],
    risks: ["CAC inflation", "churn", "low conversion", "implementation cost", "competition"],
    gtmChannels: ["enterprise outbound", "PLG expansion", "marketplace", "partners"],
    diagrams: ["SaaS funnel", "ARR bridge", "risk heatmap", "phase-gate roadmap"],
    recommendationRule: "Proceed only when unit economics and retention are validated.",
    scoreBoosters: ["High activation", "Strong team retention", "Low CAC", "Net revenue retention above 110%"],
    scoreReducers: ["High churn", "Weak differentiation", "Crowded category", "Low paid conversion"],
  },
  ai_product: {
    type: "ai_product",
    label: "AI product",
    titleSignals: [/\bai\b/i, /agent/i, /copilot/i, /model/i, /automation/i],
    industrySignals: [/artificial intelligence/i, /machine learning/i, /genai/i, /automation/i],
    coreTerms: ["model risk", "data readiness", "AI governance", "inference cost", "value realization", "human-in-the-loop"],
    bannedTerms: [],
    sourceSignals: [/ai/i, /model/i, /machine learning/i, /llm/i, /governance/i],
    competitorSignals: [/openai/i, /anthropic/i, /microsoft copilot/i, /google/i, /databricks/i],
    compliance: ["AI governance", "data privacy", "model monitoring", "responsible AI"],
    risks: ["model accuracy", "hallucination", "inference cost", "data quality", "AI governance gap"],
    gtmChannels: ["enterprise pilots", "workflow integration", "platform partnerships"],
    diagrams: ["AI workflow", "model governance", "value realization map", "risk heatmap"],
    recommendationRule: "Use gated validation until data readiness, model quality and value capture are proven.",
    scoreBoosters: ["High-quality data", "Low inference cost", "Measured productivity gain", "Clear human review"],
    scoreReducers: ["Poor data readiness", "Uncontrolled inference cost", "Weak governance", "No value tracking"],
  },
  marketplace: {
    type: "marketplace",
    label: "Marketplace",
    titleSignals: [/marketplace/i, /two-sided/i],
    industrySignals: [/marketplace/i, /platform/i, /commerce/i],
    coreTerms: ["liquidity", "supply", "demand", "take rate", "network effects", "retention"],
    bannedTerms: [],
    sourceSignals: [/marketplace/i, /take rate/i, /supply/i, /demand/i],
    competitorSignals: [/amazon/i, /airbnb/i, /uber/i, /etsy/i, /fiverr/i],
    compliance: ["payments", "platform policies", "trust and safety"],
    risks: ["cold start", "low liquidity", "CAC", "supply quality", "trust issues"],
    gtmChannels: ["supply acquisition", "demand acquisition", "partnerships", "community loops"],
    diagrams: ["Marketplace flywheel", "liquidity curve", "unit economics", "risk heatmap"],
    recommendationRule: "Proceed only if one side of the marketplace can be seeded cheaply and retained.",
    scoreBoosters: ["Reliable supply", "Repeat demand", "Low CAC", "Strong take rate"],
    scoreReducers: ["Cold-start risk", "Weak liquidity", "High trust friction", "Low repeat usage"],
  },
  fintech: {
    type: "fintech",
    label: "FinTech",
    titleSignals: [/fintech/i, /payment/i, /wallet/i, /banking/i, /lending/i],
    industrySignals: [/financial/i, /fintech/i, /banking/i, /payments/i],
    coreTerms: ["licensing", "fraud", "KYC", "AML", "payment rails", "compliance"],
    bannedTerms: [],
    sourceSignals: [/fintech/i, /payments/i, /bank/i, /kyc/i, /aml/i, /fraud/i],
    competitorSignals: [/stripe/i, /paypal/i, /square/i, /adyen/i, /wise/i],
    compliance: ["KYC", "AML", "fraud controls", "licensing", "payment security"],
    risks: ["licensing delay", "fraud", "chargebacks", "payment rail dependency", "regulatory change"],
    gtmChannels: ["bank partnerships", "embedded finance", "direct sales", "developer channels"],
    diagrams: ["Payment flow", "compliance map", "unit economics", "risk heatmap"],
    recommendationRule: "Use Conditional Proceed until licensing, fraud controls and payment economics are validated.",
    scoreBoosters: ["Licensing path", "Low fraud rate", "Reliable payment rails", "Clear unit economics"],
    scoreReducers: ["Licensing delay", "Fraud exposure", "Chargebacks", "Unclear compliance owner"],
  },
  enterprise_software: {
    type: "enterprise_software",
    label: "Enterprise software",
    titleSignals: [/enterprise software/i, /management platform/i],
    industrySignals: [/enterprise/i, /software/i, /it/i],
    coreTerms: ["procurement", "integrations", "security", "implementation", "customer success", "renewals"],
    bannedTerms: ["cloud collaboration SaaS"],
    sourceSignals: [/enterprise/i, /software/i, /security/i, /implementation/i],
    competitorSignals: [/salesforce/i, /servicenow/i, /oracle/i, /sap/i, /snowflake/i, /databricks/i],
    compliance: ["SOC2", "SSO", "audit logs", "data privacy", "enterprise security review"],
    risks: ["long sales cycle", "implementation delay", "low adoption", "integration burden", "renewal risk"],
    gtmChannels: ["enterprise outbound", "systems integrators", "cloud marketplace", "customer expansion"],
    diagrams: ["Enterprise workflow", "architecture", "implementation roadmap", "risk heatmap"],
    recommendationRule: "Proceed only if security review, implementation cost and renewal path are credible.",
    scoreBoosters: ["Named buyer", "Integration path", "Security review passed", "Customer success capacity"],
    scoreReducers: ["Long sales cycle", "Implementation burden", "Weak renewal signal", "Security review gaps"],
  },
};

function countMatches(patterns: RegExp[], text: string) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function detectReportType(inputs: ConceptInputs, report: FeasibilityReport): ReportType {
  const title = `${inputs.projectName}`.toLowerCase();
  const industry = `${inputs.industry} ${inputs.location}`.toLowerCase();
  const body = `${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.assumptions} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${report.executiveSummary}`.toLowerCase();
  const ranked = Object.values(REPORT_TEMPLATES)
    .map((template) => ({ type: template.type, score: countMatches(template.titleSignals, title) * 14 + countMatches(template.industrySignals, industry) * 5 + countMatches(template.titleSignals, body) * 4 + countMatches(template.industrySignals, body) * 2 }))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].type : "generic_saas";
}

export function getReportTemplate(inputs: ConceptInputs, report: FeasibilityReport): ReportTemplate {
  return REPORT_TEMPLATES[detectReportType(inputs, report)];
}

export function getRecommendation(overallScore: number, riskScore: number, type: ReportType): Verdict {
  if (type === "healthcare_rpm" || type === "enterprise_data_insights" || type === "customer_data_platform") return "Conditional Proceed";
  const highRisk = riskScore < 7;
  if (overallScore >= 8.5 && !highRisk) return "Proceed";
  if (overallScore >= 7) return "Conditional Proceed";
  if (overallScore >= 5.5) return "Hold / Validate Further";
  return "Do Not Proceed";
}

export function sourceQuality(source = "", title = ""): SourceQuality {
  const text = `${source} ${title}`.toLowerCase();
  if (/cms|fda|hhs|\.gov|sec|annual report|10-k|official|company|microsoft|tableau|google|qlik|thoughtspot|domo|sigma|mode|twilio|segment|salesforce|adobe|tealium|mparticle|treasure data|hightouch|rudderstack|actioniq|blueconic/.test(text)) return "Primary";
  if (/mckinsey|bcg|bain|deloitte|gartner|forrester|academic|journal|nih|jama|nejm|idc/.test(text)) return "Expert";
  if (/market|research|insights|grand view|marketsandmarkets|statista|mordor|researchandmarkets|tavily|martech/.test(text)) return "Market";
  return "Weak";
}

export function sanitizeForTemplate(text: string, template: ReportTemplate) {
  let output = text;
  const replacements: Array<[RegExp, string]> = [];
  if (template.type === "healthcare_rpm") {
    replacements.push(
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
    );
  }
  if (template.type === "enterprise_data_insights") {
    replacements.push(
      [/cloud collaboration SaaS/gi, "enterprise data insights platform"],
      [/departmental work, shared knowledge, workflows and reporting across teams/gi, "source systems, governed metrics, analytics workflows and decision actions across business units"],
      [/team workspace/gi, "governed analytics workspace"],
      [/team chat/gi, "insight collaboration"],
      [/document collaboration/gi, "governed metric collaboration"],
      [/shared knowledge/gi, "shared metric definitions"],
    );
  }
  if (template.type === "customer_data_platform") {
    replacements.push(
      [/cloud collaboration SaaS/gi, "customer data platform"],
      [/team collaboration/gi, "customer data activation"],
      [/document collaboration/gi, "customer profile governance"],
      [/workspace as core product/gi, "customer 360 profile as core product"],
      [/shared knowledge/gi, "shared customer attributes"],
    );
  }
  replacements.forEach(([pattern, replacement]) => {
    output = output.replace(pattern, replacement);
  });
  return output;
}

function countRequiredTerms(template: ReportTemplate, text: string) {
  return template.coreTerms.filter((term) => text.includes(term.toLowerCase())).length;
}

function isWeakSourceOnly(report: FeasibilityReport) {
  const citations = report.research?.citations ?? [];
  return citations.length > 0 && citations.every((c) => sourceQuality(c.source, c.title) === "Weak");
}

export function validateTemplateIntegrity(inputs: ConceptInputs, report: FeasibilityReport): TemplateValidationResult {
  const template = getReportTemplate(inputs, report);
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  const title = inputs.projectName || "";
  const industry = inputs.industry || "";
  const competitorText = (report.competitors || []).map((c) => `${c.name} ${c.model} ${c.edge} ${c.weakness}`).join(" ");
  const sourceText = (report.research?.citations || []).map((c) => `${c.source} ${c.title} ${c.takeaway}`).join(" ");
  const financialText = `${report.financials?.investmentRange ?? ""} ${report.financials?.breakEvenSummary ?? ""} ${report.financials?.ltvCacRatio ?? ""} ${(report.financials?.scenarios ?? []).map((s) => `${s.subscribersYr1} ${s.annualRevenue} ${s.breakEven}`).join(" ")}`;
  const assumptionText = `${inputs.description} ${inputs.assumptions} ${inputs.constraints} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${inputs.dependencies} ${report.executiveSummary} ${report.recommendations.join(" ")} ${report.nextSteps.join(" ")} ${financialText}`;
  const fullText = `${title} ${industry} ${competitorText} ${sourceText} ${assumptionText}`.toLowerCase();
  const issues: TemplateValidationIssue[] = [];

  if (countMatches(template.titleSignals, title.toLowerCase()) === 0 && countMatches(template.industrySignals, industry.toLowerCase()) === 0 && countMatches(template.industrySignals, assumptionText.toLowerCase()) === 0) {
    issues.push({ severity: "warning", field: "title/industry", message: `Title, industry and concept do not strongly match ${template.label}.` });
  }
  template.bannedTerms.forEach((term) => {
    if (fullText.includes(term.toLowerCase())) issues.push({ severity: "error", field: "bannedTerms", message: `Banned ${template.label} term found: ${term}` });
  });
  if ((report.research?.citations?.length || 0) === 0) {
    issues.push({ severity: "error", field: "sources", message: "Source Notes are empty. Add ranked citations before export." });
  } else if (countMatches(template.sourceSignals, sourceText.toLowerCase()) === 0) {
    issues.push({ severity: "error", field: "sources", message: `Sources do not clearly match ${template.label}.` });
  }
  if (isWeakSourceOnly(report)) {
    issues.push({ severity: "error", field: "sources", message: "Only weak sources are present. Add primary, expert or market sources before export." });
  }
  if ((report.competitors?.length || 0) === 0) {
    issues.push({ severity: "error", field: "competitors", message: "Competitor set is empty." });
  } else if (countMatches(template.competitorSignals, competitorText.toLowerCase()) === 0) {
    issues.push({ severity: "error", field: "competitors", message: `Competitors do not clearly match ${template.label}.` });
  }
  if (countRequiredTerms(template, fullText) < Math.min(4, template.coreTerms.length)) {
    issues.push({ severity: "error", field: "requiredTerms", message: `Required ${template.label} terms are missing from the report.` });
  }
  if ((report.financials?.scenarios?.length || 0) < 3 || /derived from scenario revenue|track first 10 customers|target >3:1/i.test(financialText)) {
    issues.push({ severity: "error", field: "financials", message: "Financial model contains placeholders or incomplete scenarios." });
  }
  if (template.type === "healthcare_rpm" && /cloud collaboration|team workspace|slack|microsoft teams/i.test(title + assumptionText)) {
    issues.push({ severity: "error", field: "crossTemplate", message: "Cloud collaboration terms found inside healthcare/RPM report." });
  }
  if (template.type === "generic_saas" && /patient|hipaa|reimbursement|ehr|clinician|post-discharge|customer data platform|identity resolution|unified customer profile/i.test(assumptionText + sourceText)) {
    issues.push({ severity: "error", field: "crossTemplate", message: "Non-generic SaaS terms found inside cloud collaboration/generic SaaS report." });
  }
  if (template.type === "enterprise_data_insights" && /slack|notion|asana|monday|microsoft teams|team chat|video meetings|cloud collaboration SaaS/i.test(competitorText + assumptionText)) {
    issues.push({ severity: "error", field: "crossTemplate", message: "Cloud collaboration terms found inside enterprise data insights report." });
  }
  if (template.type === "customer_data_platform" && /slack|notion|asana|monday|microsoft teams|team chat|video meetings|cloud collaboration SaaS|remote patient monitoring|inter-agency/i.test(competitorText + assumptionText)) {
    issues.push({ severity: "error", field: "crossTemplate", message: "Non-CDP terms found inside customer data platform report." });
  }
  return { reportType: template.type, template, recommendation, issues, hasBlockingIssues: issues.some((issue) => issue.severity === "error") };
}
