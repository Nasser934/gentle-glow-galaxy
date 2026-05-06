import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerValidationNote, sanitizeConsumerText } from "@/lib/consumerSafety";
import { buildArchitectureRows, buildConceptNarrative, buildHeadSummary, buildValidationPlan, buildWorkflowRows, effectiveAnalysisConfidence, evidenceRows } from "@/lib/reportPresentation";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (value: string) => void };

const TOTAL = "{total_pages_count_string}";
const W = 595.28;
const H = 841.89;
const M = 42;
const NAVY: [number, number, number] = [11, 31, 58];
const MUTED: [number, number, number] = [92, 100, 112];
const BORDER: [number, number, number] = [209, 213, 219];
const STRIPE: [number, number, number] = [246, 247, 249];
const drawn = new Set<number>();

const score = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)} / 10` : "—";
const money = (v: unknown) => typeof v === "number" ? `USD ${Math.round(v).toLocaleString()}` : sanitizeConsumerText(v);

function header(pdf: jsPDF, title: string, section: string) {
  const page = pdf.getNumberOfPages();
  if (drawn.has(page)) return;
  drawn.add(page);
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("CONCEPT AI · BRD-ALIGNED FEASIBILITY STUDY", M, 28);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.text(sanitizeConsumerText(title), W - M, 28, { align: "right" });
  pdf.setDrawColor(...BORDER);
  pdf.line(M, H - 42, W - M, H - 42);
  pdf.setFontSize(7.2);
  pdf.text(`${sanitizeConsumerText(section)} | Page ${page} of ${TOTAL}`, M, H - 26);
}

function cover(pdf: jsPDF, title: string, subtitle: string, reportId: string, reportType: string) {
  drawn.clear();
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, H, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(title), W - M * 2), M, 140);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(subtitle), W - M * 2), M, 218);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Business Requirements Review Output", M, 288);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text("Executive brief, concept detail, workflow, architecture, FMART, financials, risks, roadmap, validation plan and evidence gaps.", M, 308, { maxWidth: W - M * 2 });
  pdf.setFontSize(10);
  pdf.text(`Report ${sanitizeConsumerText(reportId)} · ${sanitizeConsumerText(reportType)}`, M, 708);
  pdf.text("Confidential · Concept AI", M, 730);
}

function page(pdf: jsPDF, title: string, section: string, intro: string) {
  pdf.addPage();
  header(pdf, title, section);
  pdf.setTextColor(...NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(section.toUpperCase(), M, 70);
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(intro), W - M * 2), M, 90);
  pdf.setDrawColor(...BORDER);
  pdf.line(M, 122, W - M, 122);
  return 146;
}

function para(pdf: jsPDF, y: number, text: unknown) {
  const lines = pdf.splitTextToSize(sanitizeConsumerText(text), W - M * 2) as string[];
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(lines, M, y);
  return y + lines.length * 11 + 10;
}

function table(pdf: jsPDF, y: number, title: string, section: string, head: string[], rows: unknown[][]) {
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M, top: 54, bottom: 58 },
    head: [head],
    body: rows.map((row) => row.map((cell) => sanitizeConsumerText(cell))),
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 4, overflow: "linebreak", valign: "top", lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: STRIPE },
    didDrawPage: () => header(pdf, title, section),
  });
  return ((pdf as PdfWithTable).lastAutoTable?.finalY ?? y) + 16;
}

function bullets(pdf: jsPDF, y: number, items: unknown[]) {
  items.filter(Boolean).slice(0, 10).forEach((item) => {
    const lines = pdf.splitTextToSize(sanitizeConsumerText(item), W - M * 2 - 14) as string[];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.7);
    pdf.setTextColor(17, 24, 39);
    pdf.text("•", M, y);
    pdf.text(lines, M + 14, y);
    y += lines.length * 11 + 6;
  });
  return y;
}

export async function exportBRDReportPdf(fileName: string, payload: Payload): Promise<{ fileName: string }> {
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  const confidence = effectiveAnalysisConfidence(report);
  const title = sanitizeConsumerText(inputs.projectName || "Feasibility Study");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  cover(pdf, title, `${sanitizeConsumerText(inputs.industry || "Business concept")} · ${sanitizeConsumerText(inputs.location || "Selected market")}`, report.reportId, validation.template.label);

  let y = page(pdf, title, "Executive brief", "Decision-first summary with the reason, winning wedge, confidence level and validation path.");
  y = table(pdf, y, title, "Executive brief", ["Executive question", "Answer"], buildHeadSummary(inputs, report).map((r) => [r.label, r.value]));
  y = table(pdf, y, title, "Executive brief", ["Metric", "Value"], [["Recommendation", validation.recommendation], ["Feasibility score", score(report.scores.overall)], ["Analysis confidence", `${confidence.label} — ${confidence.sub}`], ["Investment range", report.financials.investmentRange], ["Break-even", report.financials.breakEvenSummary]]);

  y = page(pdf, title, "Detailed concept explanation", "Explains the idea before analysis so the output is not a generic template.");
  buildConceptNarrative(inputs, report).forEach((p) => { y = para(pdf, y, p); });
  y = table(pdf, y, title, "Detailed concept explanation", ["Input", "Value"], [["Project description", inputs.description || report.executiveSummary], ["Strategic objectives", inputs.strategicObjectives || "Validate project value and execution path."], ["Business model", inputs.businessModel || "To be validated"], ["Revenue model", inputs.revenueModel || "To be validated"], ["Buyer need", report.customer.goals]]);

  y = page(pdf, title, "Workflow and architecture", "Shows how the solution creates value and what platform layers are required.");
  y = table(pdf, y, title, "Workflow and architecture", ["Step", "Input", "Activity", "Output", "Control"], buildWorkflowRows(inputs, report).map((r) => [r.step, r.input, r.activity, r.output, r.control]));
  y = table(pdf, y, title, "Workflow and architecture", ["Layer", "Role"], buildArchitectureRows(inputs, report).map((r) => [r.label, r.value]));

  y = page(pdf, title, "Market and customer", "Connects market size to reachable demand and customer value.");
  y = table(pdf, y, title, "Market and customer", ["Layer", "Value", "CAGR", "Definition"], [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel]]);
  y = table(pdf, y, title, "Market and customer", ["Area", "Assessment"], [["Target customer", report.customer.ageLocation], ["Budget / income", report.customer.income], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Behavior", report.customer.behavior]]);

  y = page(pdf, title, "Competitive positioning", "Maps competitors, weaknesses and the defensible wedge.");
  y = table(pdf, y, title, "Competitive positioning", ["Competitor", "Model", "Weakness", "Project wedge"], (report.competitors || []).map((c) => [c.name, c.model, c.weakness, c.edge]));

  y = page(pdf, title, "FMART scorecard", "Scores financial, market, achievability, risk, timing and operational feasibility.");
  y = table(pdf, y, title, "FMART scorecard", ["Dimension", "Score", "Finding"], [["Financial", score(report.scores.financial), report.scores.financialFinding], ["Market", score(report.scores.market), report.scores.marketFinding], ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding], ["Risk", score(report.scores.risk), report.scores.riskFinding], ["Timing", score(report.scores.timing), report.scores.timingFinding], ["Operational", score(report.scores.operational), report.scores.operationalFinding], ["Overall", score(report.scores.overall), validation.recommendation]]);

  y = page(pdf, title, "Financial model", "Shows investment, unit economics, revenue scenarios and break-even logic.");
  y = table(pdf, y, title, "Financial model", ["Assumption", "Value"], [["Currency", report.financials.currency], ["Investment range", report.financials.investmentRange], ["CapEx low", money(report.financials.capExTotal?.low)], ["CapEx mid", money(report.financials.capExTotal?.mid)], ["CapEx high", money(report.financials.capExTotal?.high)], ["LTV:CAC", report.financials.ltvCacRatio ?? "Requires validation"]]);
  y = table(pdf, y, title, "Financial model", ["Scenario", "Probability", "Customers", "Annual revenue", "Break-even"], report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]));

  y = page(pdf, title, "Risk and controls", "Turns risk commentary into mitigation and gate implications.");
  y = table(pdf, y, title, "Risk and controls", ["Risk", "Probability", "Impact", "Level", "Mitigation"], report.risks.map((r) => [r.name, r.probability, r.impact, r.level, r.mitigation]));
  y = table(pdf, y, title, "Risk and controls", ["Priority", "Risk", "Gate implication"], report.risks.slice(0, 8).map((r, i) => [String(i + 1), r.name, r.level === "High" ? "Validate before scale funding" : "Track during next phase"]));

  y = page(pdf, title, "GTM and validation plan", "Defines how to prove buyer demand, implementation feasibility and commercial quality.");
  y = table(pdf, y, title, "GTM and validation plan", ["Channel", "Role"], validation.template.gtmChannels.map((c) => [c, "Use for pilots, buyer validation and conversion learning."]));
  y = table(pdf, y, title, "GTM and validation plan", ["Validation area", "Required proof"], buildValidationPlan(inputs, report).map((r) => [r.label, r.value]));

  y = page(pdf, title, "Roadmap and final decision", "Links the recommendation to stage gates and next actions.");
  if (report.implementationRoadmap?.phases?.length) y = table(pdf, y, title, "Roadmap and final decision", ["Phase", "Timeline", "Activities", "Gate", "Metric"], report.implementationRoadmap.phases.map((p) => [p.phase, p.timeline, p.keyActivities, p.decisionGate, p.successMetric]));
  else y = bullets(pdf, y, report.nextSteps ?? []);
  y = bullets(pdf, y, report.recommendations ?? []);
  y = para(pdf, y, `Final recommendation: ${validation.recommendation}. Proceed only through the stated validation gates and funding controls.`);

  y = page(pdf, title, "Evidence and source gaps", "If citations are missing, the report must state the validation gap instead of leaving sources empty.");
  y = table(pdf, y, title, "Evidence and source gaps", ["Evidence label", "Source / gap", "Supported point"], evidenceRows(report).map((r) => [r.label, r.value, r.note || "Supports report context."]));
  y = para(pdf, y, consumerValidationNote);

  if ((pdf as PdfWithTable).putTotalPages) (pdf as PdfWithTable).putTotalPages?.(TOTAL);
  pdf.save(fileName);
  return { fileName };
}
