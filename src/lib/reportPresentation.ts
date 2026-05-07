import type { ConceptInputs, FeasibilityReport, UseCaseProfile } from "@/types/analysis";
import { sourceQuality } from "@/lib/reportTemplates";
import { sanitizeConsumerText } from "@/lib/consumerSafety";

export type PresentationRow = { label: string; value: string; note?: string };
export type DiagramRow = { step: string; input: string; activity: string; output: string; control: string };

function profile(report: FeasibilityReport): UseCaseProfile | undefined {
  return report.useCaseProfile;
}

function fallbackLabel(inputs: ConceptInputs) {
  const text = `${inputs.projectName} ${inputs.industry} ${inputs.description} ${inputs.businessModel} ${inputs.revenueModel}`.toLowerCase();
  if (text.includes("workflow")) return "Enterprise workflow automation SaaS";
  if (text.includes("identity") || text.includes("kyc") || text.includes("biometric")) return "Identity verification / security SaaS";
  if (text.includes("marketplace") || text.includes("gmv") || text.includes("take rate")) return "B2B marketplace / procurement platform";
  if (text.includes("government") || text.includes("agency") || text.includes("fedramp")) return "Public-sector data exchange";
  if (text.includes("business intelligence") || text.includes("data insights")) return "Enterprise data insights / BI analytics";
  if (text.includes("customer data platform") || text.includes("customer 360")) return "Customer data platform";
  return "SaaS feasibility";
}

export function presentationReportLabel(inputs: ConceptInputs, report: FeasibilityReport) {
  return sanitizeConsumerText(profile(report)?.reportTypeLabel || fallbackLabel(inputs));
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
  const p = profile(report);
  const label = presentationReportLabel(inputs, report);
  const confidence = effectiveAnalysisConfidence(report);
  const recommendation = report.scores.overall >= 8.5 && report.scores.risk >= 7 ? "Proceed" : report.scores.overall >= 7 ? "Conditional Proceed" : "Hold / Validate Further";
  const firstCompetitor = report.competitors?.[0];
  return [
    { label: "What the idea is", value: p ? `${inputs.projectName || "The project"} is ${articleFor(label)} ${label.toLowerCase()} for ${p.buyer}. It helps ${p.users} ${p.jobToBeDone}.` : `${inputs.projectName || "The project"} is ${articleFor(label)} ${label.toLowerCase()} for ${report.customer?.ageLocation || "a defined customer segment"}.` },
    { label: "Why it matters", value: p?.marketFrame || report.scores.marketFinding || "The opportunity depends on reachable demand and validated buyer urgency." },
    { label: "Where it can win", value: p?.competitorFrame || (firstCompetitor ? `${firstCompetitor.edge} against ${firstCompetitor.name}.` : "The wedge must be proven against the strongest incumbents.") },
    { label: "Investment decision", value: `${recommendation}. Score: ${report.scores.overall.toFixed(1)} / 10. Confidence: ${confidence.label}. ${confidence.reason}` },
  ];
}

export function buildConceptNarrative(inputs: ConceptInputs, report: FeasibilityReport) {
  const p = profile(report);
  const label = presentationReportLabel(inputs, report);
  if (p) return [
    `${inputs.projectName || "The concept"} is ${articleFor(label)} ${label.toLowerCase()}. The business situation is: ${p.useCase}.`,
    `Buyer and user logic: the buyer is ${p.buyer}, while the primary users are ${p.users}. The job to be done is ${p.jobToBeDone}.`,
    `Operating logic: it replaces ${p.workflowReplaced}, monetizes through ${p.monetizationLogic}, and should be tested through ${p.gtmMotion}.`,
  ];
  return [
    `${inputs.projectName || "The concept"} should be explained as ${articleFor(label)} ${label.toLowerCase()}.`,
    `The commercial model is ${inputs.businessModel || "to be validated"}, with ${inputs.revenueModel || "revenue assumptions to be validated"}.`,
    "The analysis must stay specific to the submitted use case and avoid unrelated sector logic.",
  ];
}

export function buildWorkflowRows(_inputs: ConceptInputs, report: FeasibilityReport): DiagramRow[] {
  const steps = profile(report)?.workflowSteps;
  if (steps?.length) return steps.slice(0, 6);
  return [
    { step: "1", input: "Target customer need", activity: "Capture and qualify the use case", output: "Validated problem statement", control: "Buyer fit check" },
    { step: "2", input: "Workflow and data inputs", activity: "Run the proposed product workflow", output: "Measurable business result", control: "Operational control point" },
    { step: "3", input: "Usage and financial data", activity: "Measure adoption and economics", output: "Scale decision", control: "Validation gate" },
  ];
}

export function buildArchitectureRows(_inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const rows = profile(report)?.architectureLayers;
  if (rows?.length) return rows.slice(0, 8);
  return [
    { label: "Experience layer", value: "Guided workflow for the target users and buyer roles." },
    { label: "Application layer", value: "Core product logic, permissions, workflow automation and analytics." },
    { label: "Data layer", value: "Structured inputs, usage events, business records and reporting data." },
    { label: "Security layer", value: "SSO, access controls, audit logs and privacy controls." },
  ];
}

export function buildValidationPlan(_inputs: ConceptInputs, report: FeasibilityReport): PresentationRow[] {
  const rows = profile(report)?.validationGates;
  if (rows?.length) return rows.slice(0, 8);
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
