import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { getReportTemplate, getRecommendation, sourceQuality } from "@/lib/reportTemplates";
import { sanitizeConsumerText } from "@/lib/consumerSafety";

export type PresentationRow = { label: string; value: string; note?: string };
export type DiagramRow = { step: string; input: string; activity: string; output: string; control: string };

type Domain =
  | "marketplace"
  | "financial_ai"
  | "identity_verification"
  | "enterprise_workflow"
  | "public_sector_data_exchange"
  | "enterprise_data_insights"
  | "customer_data_platform"
  | "healthcare_rpm"
  | "generic_saas";

const clean = (value?: string) => (value ?? "").toLowerCase();

function userText(inputs: ConceptInputs) {
  return `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel} ${inputs.strategicObjectives} ${inputs.dependencies} ${inputs.assumptions} ${inputs.constraints} ${inputs.successFactors} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${inputs.competitorUrls}`.toLowerCase();
}

function allText(inputs: ConceptInputs, report: FeasibilityReport) {
  return `${userText(inputs)} ${report.executiveSummary} ${report.customer?.goals ?? ""}`.toLowerCase();
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

export function resolvePresentationDomain(inputs: ConceptInputs, report: FeasibilityReport): Domain {
  const user = userText(inputs);
  const all = allText(inputs, report);
  const title = clean(inputs.projectName);
  const industry = clean(inputs.industry);

  if (has(all, /remote patient|patient monitoring|\brpm\b|hospital|clinic|ehr|hipaa|healthcare|clinical/)) return "healthcare_rpm";
  if (has(all, /inter-agency|secure data exchange|government data|public sector|agency|fedramp|sovereign cloud|govtech/)) return "public_sector_data_exchange";
  if (has(all, /identity verification|digital identity|kyc|aml|fraud|liveness|biometric|eid|eidas|onboarding verification|id verification/)) return "identity_verification";
  if (has(all, /customer data platform|\bcdp\b|customer 360|unified customer|identity resolution|first-party data|segmentation|activation|personalization/)) return "customer_data_platform";
  if (has(all, /workflow automation|workflow platform|enterprise workflow|task assignment|task tracking|cross-departmental|orchestration|erp\/hris|hris|work about work|process automation|approval workflow/)) return "enterprise_workflow";
  if (has(all, /data insights|business intelligence|\bbi\b|analytics platform|enterprise analytics|semantic layer|time-to-insight|dashboard|governed kpi/)) return "enterprise_data_insights";

  const marketplaceExplicit = has(user, /marketplace|b2b procurement|procurement platform|supplier marketplace|buyer marketplace|rfq|sourcing platform|catalog marketplace|gmv|take rate|commission-based|vendor marketplace|e-commerce marketplace/);
  const onlyProcurementCycle = has(all, /procurement cycle|procurement cycles|enterprise procurement|sales procurement/) && !marketplaceExplicit;
  if (marketplaceExplicit && !onlyProcurementCycle) return "marketplace";

  if (has(all, /financial|finance|bank|banking|investment|hedge fund|asset manager|alpha|portfolio|trading|capital market/) && has(all, /ai|artificial intelligence|machine learning|llm|model|predictive|analytics/)) return "financial_ai";
  if (has(title + " " + industry + " " + user, /saas|software|platform|enterprise|automation/)) return "generic_saas";
  return "generic_saas";
}

export function isMarketplaceConcept(inputs: ConceptInputs, report: FeasibilityReport) {
  return resolvePresentationDomain(inputs, report) === "marketplace";
}

export function isFinancialAiConcept(inputs: ConceptInputs, report: FeasibilityReport) {
  return resolvePresentationDomain(inputs, report) === "financial_ai";
}

export function presentationReportLabel(inputs: ConceptInputs, report: FeasibilityReport) {
  const domain = resolvePresentationDomain(inputs, report);
  if (domain === "marketplace") return "B2B marketplace / procurement platform";
  if (domain === "financial_ai") return "Financial AI analytics";
  if (domain === "identity_verification") return "Identity verification / security SaaS";
  if (domain === "enterprise_workflow") return "Enterprise workflow automation SaaS";
  if (domain === "public_sector_data_exchange") return "Public-sector data exchange";
  if (domain === "enterprise_data_insights") return "Enterprise data insights / BI analytics";
  if (domain === "customer_data_platform") return "Customer data platform";
  if (domain === "healthcare_rpm") return "Healthcare / remote patient monitoring";
  const label = getReportTemplate(inputs, report).label;
  if (label === "AI product") return "AI product feasibility";
  if (label.includes("cloud collaboration")) return "SaaS feasibility";
  return label;
}

export function articleFor(label: string) {
  return /^[aeiou]/i.test(label) ? "an" : "a";
}

export function effectiveAnalysisConfidence(report: FeasibilityReport) {
  const citations = report.research?.citations ?? [];
  const real = citations.filter((c) => c.title || c.url || c.source);
  const strong = real.filter((c) => sourceQuality(c.source, c.title) !== "Weak");
  if (real.length === 0) return { label: "Low" as const, sub: "Primary research required", reason: "Evidence gap: no external sources were included in this report version." };
  if (real.length < 3 || strong.length === 0) return { label: "Medium" as const, sub: `${real.length} evidence item${real.length === 1 ? "" : "s"}`, reason: "Evidence is useful but incomplete." };
  return { label: report.research?.confidence ?? "Medium", sub: `${real.length} evidence items`, reason: "The report includes supporting evidence." };
}

export function normalizeReportForDisplay(report: FeasibilityReport): FeasibilityReport {
  const copy = JSON.parse(JSON.stringify(report)) as FeasibilityReport;
  const confidence = effectiveAnalysisConfidence(copy);
  copy.research = copy.research ?? { overview: "Market assumptions require primary validation.", confidence: confidence.label, sentiment: "Insufficient data", keySignals: [], painPoints: [], competitorMentions: [], redditSignals: [], webSignals: [], citations: [] };
  copy.research.confidence = confidence.label;
  copy.executiveSummary = sanitizeConsumerText(copy.executiveSummary);
  copy.recommendations = (copy.recommendations ?? []).map((r) => sanitizeConsumerText(r));
  copy.nextSteps = (copy.nextSteps ?? []).map((r) => sanitizeConsumerText(r));
  return copy;
}

export function buildHeadSummary(inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const template = getReportTemplate(inputs, report);
  const label = presentationReportLabel(inputs, report);
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  const confidence = effectiveAnalysisConfidence(report);
  const firstCompetitor = report.competitors?.[0];
  return [
    { label: "What the idea is", value: `${inputs.projectName || "The project"} is ${articleFor(label)} ${label.toLowerCase()} concept for ${report.customer?.ageLocation || "a defined customer segment"}. It targets ${report.customer?.goals || "a clear business problem"}.` },
    { label: "Why it matters", value: report.scores.marketFinding || "The opportunity depends on reachable demand and validated buyer urgency." },
    { label: "Where it can win", value: firstCompetitor ? `${firstCompetitor.edge} against ${firstCompetitor.name}.` : "The wedge must be proven against the strongest incumbents." },
    { label: "Investment decision", value: `${recommendation}. Score: ${report.scores.overall.toFixed(1)} / 10. Confidence: ${confidence.label}. ${confidence.reason}` },
  ];
}

export function buildConceptNarrative(inputs: ConceptInputs, report: FeasibilityReport) {
  const domain = resolvePresentationDomain(inputs, report);
  const label = presentationReportLabel(inputs, report);
  const template = getReportTemplate(inputs, report);
  if (domain === "enterprise_workflow") return [
    `${inputs.projectName || "The concept"} should be explained as enterprise workflow automation SaaS, not as a marketplace. The report must define the enterprise buyer, user roles, approval flows, integration points, security controls, implementation effort, and measurable productivity gain.`,
    `The commercial model is ${inputs.businessModel || "SaaS / subscription"}, with ${inputs.revenueModel || "recurring subscription revenue"}. The feasibility case must connect ACV, implementation cost, enterprise sales cycle, activation, retention, expansion revenue, customer success capacity, and switching cost.`,
    "The analysis must address ERP/HRIS/CRM integrations, SSO, RBAC, audit logs, SOC 2, GDPR, admin controls, workflow governance, change management, and adoption by non-technical departments.",
  ];
  if (domain === "identity_verification") return [
    `${inputs.projectName || "The concept"} should be explained as identity verification and security SaaS. The report must define the onboarding workflow, verification checks, data captured, compliance requirements, fraud reduction logic, and conversion impact.`,
    `The commercial model is ${inputs.businessModel || "SaaS / API subscription"}, with ${inputs.revenueModel || "usage or recurring subscription revenue"}. The feasibility case must connect verification volume, ACV, false rejection cost, fraud loss reduction, integration effort, privacy controls, retention, and expansion revenue.`,
    "The analysis must address KYC/AML where relevant, liveness detection, biometric/document verification, PII security, GDPR/eIDAS, SOC 2, audit logs, data residency, and zero-breach operating controls.",
  ];
  if (domain === "marketplace") return [
    `${inputs.projectName || "The concept"} should be explained as a B2B procurement marketplace. The report must define the buyer side, supplier side, first vertical, transaction flow, trust mechanism, payment flow, fulfilment model, and liquidity strategy.`,
    `The commercial model is ${inputs.businessModel || "Marketplace / Platform"}, with ${inputs.revenueModel || "transaction or commission revenue"}. The feasibility case must connect GMV, take rate, supplier acquisition, buyer repeat usage, payment settlement, logistics, CAC, retention, and operating margin.`,
    "The analysis must address cold-start liquidity, anchor suppliers, buyer onboarding, verified catalog quality, e-commerce compliance, fulfilment partnerships, and repeat purchase frequency.",
  ];
  if (domain === "financial_ai") return [
    `${inputs.projectName || "The concept"} should be explained as a financial AI analytics business. The report must define the buying institution, the user workflow, the data sources, the decision supported, and the measurable value created for risk, research, investment, or executive teams.`,
    `The commercial model is ${inputs.businessModel || "to be validated"}, with ${inputs.revenueModel || "revenue assumptions to be validated"}. The feasibility case must connect ACV, data cost, model validation effort, implementation effort, compliance burden, adoption, retention, and expansion revenue.`,
    "The analysis must address model risk, explainability, human review, auditability, data lineage, cybersecurity, integration with bank systems, and regulatory review.",
  ];
  return [
    `${inputs.projectName || "The concept"} should be explained as ${articleFor(label)} ${label.toLowerCase()} business, not as a generic software idea. The report must explain who buys it, who uses it, what workflow it replaces, and what measurable value it creates.`,
    `The commercial model is ${inputs.businessModel || "to be validated"}, with ${inputs.revenueModel || "revenue assumptions to be validated"}. The feasibility case must connect this model to adoption, sales cycle, implementation cost, retention, and expansion revenue.`,
    `The analysis should use sector terms such as ${template.coreTerms.slice(0, 6).join(", ")}. These terms anchor the report type and stop template drift.`,
  ];
}

export function buildWorkflowRows(inputs: ConceptInputs, report: FeasibilityReport): DiagramRow[] {
  const domain = resolvePresentationDomain(inputs, report);
  const type = getReportTemplate(inputs, report).type;
  if (domain === "enterprise_workflow") return [
    { step: "1", input: "Department request, task, approval or handoff", activity: "Capture workflow and route ownership", output: "Structured workflow case", control: "Role-based permissions and SLA rules" },
    { step: "2", input: "ERP, HRIS, CRM and collaboration data", activity: "Sync context and dependencies", output: "Integrated workflow record", control: "Connector monitoring and data access controls" },
    { step: "3", input: "Business rules and hierarchy", activity: "Automate assignment, escalation and status updates", output: "Live execution workflow", control: "Audit logs, SSO, RBAC and admin governance" },
    { step: "4", input: "User actions and bottlenecks", activity: "Track progress and highlight delays", output: "Manager dashboard and alerts", control: "Exception rules and approval traceability" },
    { step: "5", input: "Cycle time, adoption and renewal data", activity: "Measure productivity and expansion value", output: "ROI case and expansion plan", control: "Retention, NRR and customer success KPIs" },
  ];
  if (domain === "identity_verification") return [
    { step: "1", input: "User identity data, document image and consent", activity: "Capture and validate identity request", output: "Verification case", control: "Consent, PII minimization and data retention rules" },
    { step: "2", input: "Document, biometric and device signals", activity: "Run document, liveness and fraud checks", output: "Risk-scored verification result", control: "False rejection and fraud thresholds" },
    { step: "3", input: "KYC/AML and policy rules", activity: "Apply compliance decisioning", output: "Approve, reject or manual-review decision", control: "Audit logs and reviewer workflow" },
    { step: "4", input: "Customer app and back-office systems", activity: "Return result through API integration", output: "Completed onboarding event", control: "API security, uptime and integration monitoring" },
    { step: "5", input: "Conversion, fraud and review metrics", activity: "Measure model and workflow performance", output: "Optimization and compliance evidence", control: "SOC 2, GDPR/eIDAS and security reviews" },
  ];
  if (domain === "marketplace") return [
    { step: "1", input: "Anchor suppliers, catalog, pricing and tax details", activity: "Verify suppliers and normalize catalogs", output: "Trusted supplier base", control: "Supplier quality checks" },
    { step: "2", input: "SME buyer purchase needs", activity: "Match demand to verified suppliers", output: "Quoted procurement options", control: "Price transparency and service rules" },
    { step: "3", input: "Buyer order and payment method", activity: "Process order and commission", output: "Confirmed transaction and GMV", control: "Payment gateway and order checks" },
    { step: "4", input: "Supplier fulfilment status", activity: "Track delivery and acceptance", output: "Completed procurement event", control: "Delivery proof and issue workflow" },
    { step: "5", input: "Repeat orders, ratings and GMV data", activity: "Measure liquidity and retention", output: "Category expansion decision", control: "Repeat purchase, take rate and cohort KPIs" },
  ];
  if (domain === "financial_ai") return [
    { step: "1", input: "Market data, filings, transcripts, research notes and internal positions", activity: "Ingest licensed and internal data", output: "Permissioned financial knowledge base", control: "Data lineage and access checks" },
    { step: "2", input: "Documents, time series and portfolio context", activity: "Normalize, tag and retrieve evidence", output: "Traceable evidence pack", control: "Source citation and freshness scoring" },
    { step: "3", input: "Analyst or executive question", activity: "Run AI reasoning and scenario analysis", output: "Insight, risk signal or decision memo", control: "Model validation and confidence thresholds" },
    { step: "4", input: "AI-generated output", activity: "Human review and challenge", output: "Approved decision support output", control: "Human-in-the-loop approval and audit trail" },
    { step: "5", input: "Investment, risk or operating decision", activity: "Measure impact and feedback", output: "Model improvement and ROI tracking", control: "Backtesting, drift monitoring and value KPIs" },
  ];
  if (type === "enterprise_data_insights") return [
    { step: "1", input: "ERP, CRM, finance and operations data", activity: "Ingest source data", output: "Unified data layer", control: "Access permissions" },
    { step: "2", input: "Raw datasets", activity: "Clean and validate data", output: "Trusted metric foundation", control: "Data quality score" },
    { step: "3", input: "Business definitions", activity: "Create semantic layer", output: "Governed KPIs", control: "Metric ownership" },
    { step: "4", input: "User questions", activity: "Generate dashboards and alerts", output: "Decision-ready insights", control: "RBAC and audit logs" },
    { step: "5", input: "Usage and outcomes", activity: "Track value realization", output: "ROI and expansion case", control: "Adoption KPIs" },
  ];
  return [
    { step: "1", input: "Customer need", activity: "Capture workflow", output: "Qualified use case", control: "Segment fit" },
    { step: "2", input: "User activity", activity: "Run product workflow", output: "Measurable result", control: "Adoption" },
    { step: "3", input: "Usage and financial data", activity: "Measure value", output: "Expansion case", control: "LTV:CAC" },
  ];
}

export function buildArchitectureRows(inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const domain = resolvePresentationDomain(inputs, report);
  const type = getReportTemplate(inputs, report).type;
  if (domain === "enterprise_workflow") return [
    { label: "Workflow orchestration layer", value: "Workflow templates, task routing, ownership, approvals, escalations, SLA rules and exception handling." },
    { label: "Enterprise integration layer", value: "ERP, HRIS, CRM, identity provider, email/calendar and collaboration tool connectors." },
    { label: "Governance and admin layer", value: "SSO, RBAC, audit logs, policy controls, retention rules, admin console and compliance reporting." },
    { label: "Analytics layer", value: "Cycle time, bottlenecks, SLA adherence, adoption, productivity impact, NRR and expansion metrics." },
    { label: "Customer success layer", value: "Onboarding playbooks, department rollout tracking, health scoring and renewal risk monitoring." },
    { label: "Security layer", value: "SOC 2 roadmap, GDPR controls, encryption, tenant isolation, secrets management and security review evidence." },
  ];
  if (domain === "identity_verification") return [
    { label: "Capture layer", value: "Document upload, selfie/liveness checks, device signals, consent, PII minimization and mobile/web SDKs." },
    { label: "Verification engine", value: "Document authenticity, biometric matching, liveness detection, fraud signals, duplicate detection and risk scoring." },
    { label: "Compliance decision layer", value: "KYC/AML rules, manual review queue, policy engine, audit logs and decision evidence." },
    { label: "API integration layer", value: "Developer APIs, webhooks, customer systems, onboarding apps, CRM and case-management integrations." },
    { label: "Security and privacy layer", value: "Encryption, tokenization, data retention, regional data residency, SOC 2, GDPR/eIDAS controls and zero-breach operations." },
    { label: "Performance analytics layer", value: "Conversion rate, false rejection, fraud catch rate, review time, uptime and cost per verification." },
  ];
  if (domain === "marketplace") return [
    { label: "Supplier and catalog layer", value: "Supplier onboarding, verification records, SKU catalog, pricing, inventory, service areas and supplier scorecards." },
    { label: "Buyer procurement layer", value: "Buyer onboarding, RFQs, approval rules, budgets, saved suppliers, purchase history and recurring order workflows." },
    { label: "Matching and transaction layer", value: "Search, quote comparison, order management, take-rate calculation, payment gateway, invoicing and settlement." },
    { label: "Trust and fulfilment layer", value: "Ratings, issue management, delivery proof, logistics partners, service-level monitoring and resolution rules." },
    { label: "Growth analytics layer", value: "GMV, take rate, liquidity ratio, supplier fill rate, repeat purchase, cohort retention and category expansion metrics." },
    { label: "Compliance and security layer", value: "Tax compliance, e-commerce license, data protection, access controls, audit logs and payment security." },
  ];
  if (domain === "financial_ai") return [
    { label: "Licensed data layer", value: "Market data, filings, transcripts, research, alternative data and internal portfolio data with access checks." },
    { label: "Knowledge and retrieval layer", value: "Document parsing, embeddings, source ranking, citation traceability, freshness scoring and retrieval controls." },
    { label: "AI reasoning layer", value: "LLM workflows, financial models, risk scoring, scenario analysis, guardrails and model confidence thresholds." },
    { label: "Human review layer", value: "Analyst review, investment committee challenge, approval workflow, audit notes and override logging." },
    { label: "Enterprise integration layer", value: "APIs into research systems, portfolio management tools, CRM, data warehouse and reporting dashboards." },
    { label: "Governance layer", value: "Model validation, backtesting, drift monitoring, security, RBAC, audit logs and regulatory evidence pack." },
  ];
  if (type === "enterprise_data_insights") return [
    { label: "Source connectors", value: "ERP, CRM, data warehouse, finance, operations and external APIs." },
    { label: "Data quality layer", value: "Validation, deduplication, lineage, schema mapping and anomaly checks." },
    { label: "Semantic layer", value: "Governed KPI definitions, metric catalog and approved calculation logic." },
    { label: "Insight layer", value: "Dashboards, alerts, AI-assisted analysis and executive summaries." },
    { label: "Security layer", value: "SSO, RBAC, audit logs, encryption, data residency and tenant isolation." },
  ];
  return [
    { label: "Experience layer", value: "Guided workflow for the target users and buyer roles." },
    { label: "Application layer", value: "Core product logic, permissions, workflow automation and analytics." },
    { label: "Data layer", value: "Structured inputs, usage events, business records and reporting data." },
    { label: "Security layer", value: "SSO, access controls, audit logs and privacy controls." },
  ];
}

export function buildValidationPlan(inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const domain = resolvePresentationDomain(inputs, report);
  const type = getReportTemplate(inputs, report).type;
  if (domain === "enterprise_workflow") return [
    { label: "Buyer proof", value: "Run paid pilots with 3-5 enterprise departments and measure adoption, active workflows, cycle-time reduction and executive sponsor satisfaction." },
    { label: "Integration proof", value: "Validate ERP, HRIS, CRM, SSO and collaboration-tool connectors with implementation effort under the target scope." },
    { label: "Security proof", value: "Complete SOC 2 Type I readiness, RBAC, audit logs, data retention and GDPR controls before enterprise rollout." },
    { label: "Unit economics proof", value: "Validate ACV, CAC payback, implementation margin, customer success cost and NRR path through land-and-expand pilots." },
    { label: "Adoption proof", value: "Track workflow completion, weekly active users, department expansion, admin engagement and churn risk." },
  ];
  if (domain === "identity_verification") return [
    { label: "Verification proof", value: "Test document verification, liveness checks, fraud detection, false rejection and manual review quality with real onboarding flows." },
    { label: "Compliance proof", value: "Validate GDPR/eIDAS, KYC/AML where applicable, audit logs, retention rules, data residency and security-review evidence." },
    { label: "Buyer proof", value: "Secure pilots with fintech, healthcare or e-commerce buyers and measure conversion lift, fraud loss reduction and review-time reduction." },
    { label: "Integration proof", value: "Validate API/SDK integration speed, uptime, webhooks, customer support workflows and cost per verification." },
    { label: "Commercial proof", value: "Validate pricing, gross margin, ACV, CAC payback, volume expansion and retention before scale funding." },
  ];
  if (domain === "marketplace") return [
    { label: "Liquidity proof", value: "Onboard 20-30 anchor suppliers in one vertical and prove quote response rate, catalog depth and fill rate before broad launch." },
    { label: "Buyer proof", value: "Run pilots with 50-100 SME buyers and measure first order conversion, repeat purchase, average order value and procurement savings." },
    { label: "Transaction proof", value: "Validate payment gateway, settlement, invoicing, issue handling, fulfilment tracking and resolution rules." },
    { label: "Unit economics proof", value: "Validate GMV, take rate, supplier acquisition cost, buyer CAC, contribution margin, payment fees and operations cost per order." },
    { label: "Category expansion proof", value: "Expand only after one category shows repeat liquidity, supplier reliability and positive contribution margin." },
  ];
  if (domain === "financial_ai") return [
    { label: "Buyer validation", value: "Secure paid discovery with 5-8 target institutions and confirm the first use case: research synthesis, risk monitoring, due diligence, or portfolio insight." },
    { label: "Data validation", value: "Confirm data rights, source coverage, latency, controls, and cost per customer before pilot launch." },
    { label: "Model validation", value: "Prove accuracy, explainability, hallucination control, backtesting quality, confidence scoring, and human review workflow." },
    { label: "Security and compliance", value: "Complete SOC 2 readiness, RBAC, audit logs, zero-trust controls, regulatory review pack, and customer security questionnaire readiness." },
    { label: "Commercial validation", value: "Validate ACV, CAC payback, gross margin after data/model cost, implementation effort, pilot-to-contract conversion, and expansion path." },
  ];
  if (type === "enterprise_data_insights") return [
    { label: "Paid pilots", value: "Secure at least three paid pilots in priority verticals before scale funding." },
    { label: "Integration proof", value: "Connect core ERP, CRM and data warehouse sources and measure implementation effort." },
    { label: "Value proof", value: "Measure time-to-insight reduction and executive weekly active usage." },
    { label: "Commercial proof", value: "Validate ACV, CAC payback, gross margin, expansion path and churn risk." },
    { label: "Security proof", value: "Complete SSO, RBAC, audit logs, data residency and customer security review readiness." },
  ];
  return [
    { label: "Buyer validation", value: "Run paid discovery or pilot with target buyers." },
    { label: "Financial validation", value: "Validate ACV, CAC, margin, payback and break-even assumptions." },
    { label: "Execution validation", value: "Confirm team, vendor, technology and compliance readiness." },
  ];
}

export function evidenceRows(report: FeasibilityReport): PresentationRow[] {
  const citations = report.research?.citations ?? [];
  if (citations.length === 0) return [
    { label: "Evidence gap", value: "No external sources were included in this report version.", note: "Treat market sizing, CAC, ACV, and break-even as validation assumptions." },
    { label: "Primary research required", value: "Add customer interviews, competitor pricing, market benchmarks, and regulatory references before funding approval." },
  ];
  return citations.slice(0, 12).map((c) => ({ label: sourceQuality(c.source, c.title), value: `${c.source}: ${c.title}`, note: c.takeaway }));
}
