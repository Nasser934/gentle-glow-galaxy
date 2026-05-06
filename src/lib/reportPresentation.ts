import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { getReportTemplate, getRecommendation, sourceQuality } from "@/lib/reportTemplates";
import { sanitizeConsumerText } from "@/lib/consumerSafety";

export type PresentationRow = { label: string; value: string; note?: string };
export type DiagramRow = { step: string; input: string; activity: string; output: string; control: string };

function allText(inputs: ConceptInputs, report: FeasibilityReport) {
  return `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.strategicObjectives} ${inputs.knownRisks} ${inputs.regulatoryConsiderations} ${report.executiveSummary}`.toLowerCase();
}

export function isFinancialAiConcept(inputs: ConceptInputs, report: FeasibilityReport) {
  const text = allText(inputs, report);
  return /(financial|finance|bank|banking|investment|hedge fund|asset manager|risk|alpha|portfolio|trading|capital market)/i.test(text)
    && /(ai|artificial intelligence|machine learning|llm|model|predictive|analytics)/i.test(text);
}

export function presentationReportLabel(inputs: ConceptInputs, report: FeasibilityReport) {
  if (isFinancialAiConcept(inputs, report)) return "Financial AI analytics";
  const label = getReportTemplate(inputs, report).label;
  if (label === "AI product") return "AI product feasibility";
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
  const label = presentationReportLabel(inputs, report);
  const template = getReportTemplate(inputs, report);
  if (isFinancialAiConcept(inputs, report)) {
    return [
      `${inputs.projectName || "The concept"} should be explained as a financial AI analytics business, not as a generic AI product. The report must define the buying institution, the user workflow, the data sources, the decision supported, and the measurable value created for risk, research, investment, or executive teams.`,
      `The commercial model is ${inputs.businessModel || "to be validated"}, with ${inputs.revenueModel || "revenue assumptions to be validated"}. The feasibility case must connect ACV, data licensing cost, model validation effort, implementation effort, compliance burden, adoption, retention, and expansion revenue.`,
      "The analysis must address model risk, explainability, human review, auditability, data licensing, data lineage, cybersecurity, integration with bank systems, and regulatory review. These points are central to financial services feasibility.",
    ];
  }
  return [
    `${inputs.projectName || "The concept"} should be explained as ${articleFor(label)} ${label.toLowerCase()} business, not as a generic software idea. The report must explain who buys it, who uses it, what workflow it replaces, and what measurable value it creates.`,
    `The commercial model is ${inputs.businessModel || "to be validated"}, with ${inputs.revenueModel || "revenue assumptions to be validated"}. The feasibility case must connect this model to adoption, sales cycle, implementation cost, retention, and expansion revenue.`,
    `The analysis should use sector terms such as ${template.coreTerms.slice(0, 6).join(", ")}. These terms anchor the report type and stop template drift.`,
  ];
}

export function buildWorkflowRows(inputs: ConceptInputs, report: FeasibilityReport): DiagramRow[] {
  const type = getReportTemplate(inputs, report).type;
  if (isFinancialAiConcept(inputs, report)) return [
    { step: "1", input: "Market data, filings, transcripts, research notes and internal positions", activity: "Ingest licensed and internal data", output: "Permissioned financial knowledge base", control: "Data licensing, lineage and entitlement checks" },
    { step: "2", input: "Documents, time series and portfolio context", activity: "Normalize, tag and retrieve relevant evidence", output: "Traceable evidence pack", control: "Source citation, freshness and quality scoring" },
    { step: "3", input: "Analyst or executive question", activity: "Run AI reasoning, risk scoring and scenario analysis", output: "Insight, risk signal or decision memo", control: "Model validation and confidence thresholds" },
    { step: "4", input: "AI-generated output", activity: "Human review and challenge", output: "Approved decision support output", control: "Human-in-the-loop approval and audit trail" },
    { step: "5", input: "Investment, risk or operating decision", activity: "Measure impact and feedback", output: "Model improvement and ROI tracking", control: "Backtesting, drift monitoring and value realization KPIs" },
  ];
  if (type === "enterprise_data_insights") return [
    { step: "1", input: "ERP, CRM, finance and operations data", activity: "Ingest source data", output: "Unified data layer", control: "Access permissions" },
    { step: "2", input: "Raw datasets", activity: "Clean and validate data", output: "Trusted metric foundation", control: "Data quality score" },
    { step: "3", input: "Business definitions", activity: "Create semantic layer", output: "Governed KPIs", control: "Metric ownership" },
    { step: "4", input: "User questions", activity: "Generate dashboards and alerts", output: "Decision-ready insights", control: "RBAC and audit logs" },
    { step: "5", input: "Usage and outcomes", activity: "Track value realization", output: "ROI and expansion case", control: "Adoption KPIs" },
  ];
  if (type === "customer_data_platform") return [
    { step: "1", input: "CRM, billing and product data", activity: "Ingest customer events", output: "Customer data foundation", control: "Consent rules" },
    { step: "2", input: "Customer identifiers", activity: "Resolve identity", output: "Customer 360 profile", control: "Match accuracy" },
    { step: "3", input: "Segments", activity: "Activate audiences", output: "Personalized journeys", control: "Opt-out checks" },
    { step: "4", input: "Campaign outcomes", activity: "Measure retention and LTV", output: "Growth insights", control: "Attribution checks" },
  ];
  return [
    { step: "1", input: "Customer need", activity: "Capture workflow", output: "Qualified use case", control: "Segment fit" },
    { step: "2", input: "User activity", activity: "Run product workflow", output: "Measurable result", control: "Adoption" },
    { step: "3", input: "Usage and financial data", activity: "Measure value", output: "Expansion case", control: "LTV:CAC" },
  ];
}

export function buildArchitectureRows(inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const type = getReportTemplate(inputs, report).type;
  if (isFinancialAiConcept(inputs, report)) return [
    { label: "Licensed data layer", value: "Market data, filings, transcripts, research, alternative data and internal portfolio data with entitlement checks." },
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
  const type = getReportTemplate(inputs, report).type;
  if (isFinancialAiConcept(inputs, report)) return [
    { label: "Buyer validation", value: "Secure paid discovery with 5-8 target institutions and confirm the first use case: research synthesis, risk monitoring, due diligence, or portfolio insight." },
    { label: "Data validation", value: "Confirm data licensing rights, source coverage, latency, entitlement controls, and cost per customer before pilot launch." },
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
