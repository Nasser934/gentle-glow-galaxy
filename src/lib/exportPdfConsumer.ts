import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { sourceQuality, validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerValidationNote, sanitizeConsumerItems, sanitizeConsumerText } from "@/lib/consumerSafety";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type JsPdfAuto = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (placeholder: string) => void };

const TOTAL = "{total_pages_count_string}";
const W = 595.28;
const H = 841.89;
const M = 42;
const BOTTOM = 64;
const NAVY: [number, number, number] = [11, 31, 58];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [209, 213, 219];
const STRIPE: [number, number, number] = [243, 244, 246];

const score = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)} / 10` : "—";
const money = (v: unknown) => typeof v === "number" ? `USD ${Math.round(v).toLocaleString()}` : sanitizeConsumerText(v);

function header(pdf: jsPDF, reportTitle: string, section: string) {
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("CONCEPT AI · FEASIBILITY STUDY", M, 28);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.text(sanitizeConsumerText(reportTitle), W - M, 28, { align: "right" });
  pdf.setDrawColor(...BORDER);
  pdf.line(M, H - 42, W - M, H - 42);
  pdf.setFontSize(7.2);
  pdf.text(`${sanitizeConsumerText(section)} | Confidential | Page ${pdf.getNumberOfPages()} of ${TOTAL}`, M, H - 26);
}

function addPage(pdf: jsPDF, reportTitle: string, section: string) {
  pdf.addPage();
  header(pdf, reportTitle, section);
  return 62;
}

function ensure(pdf: jsPDF, y: number, need: number, reportTitle: string, section: string) {
  return y + need > H - BOTTOM ? addPage(pdf, reportTitle, section) : y;
}

function titleBlock(pdf: jsPDF, y: number, section: string, insight: string, reportTitle: string) {
  y = ensure(pdf, y, 70, reportTitle, section);
  pdf.setTextColor(...NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(section).toUpperCase(), W - M * 2), M, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  const lines = pdf.splitTextToSize(sanitizeConsumerText(insight), W - M * 2) as string[];
  pdf.text(lines, M, y + 18);
  pdf.setDrawColor(...BORDER);
  pdf.line(M, y + 18 + lines.length * 10 + 8, W - M, y + 18 + lines.length * 10 + 8);
  return y + 18 + lines.length * 10 + 26;
}

function paragraph(pdf: jsPDF, y: number, body: unknown, reportTitle: string, section: string) {
  const lines = pdf.splitTextToSize(sanitizeConsumerText(body), W - M * 2) as string[];
  y = ensure(pdf, y, lines.length * 11 + 12, reportTitle, section);
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(lines, M, y);
  return y + lines.length * 11 + 10;
}

function bullets(pdf: jsPDF, y: number, items: unknown[], reportTitle: string, section: string) {
  sanitizeConsumerItems(items, 12).forEach((item) => {
    const lines = pdf.splitTextToSize(item, W - M * 2 - 14) as string[];
    y = ensure(pdf, y, lines.length * 11 + 8, reportTitle, section);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.7);
    pdf.setTextColor(17, 24, 39);
    pdf.text("•", M, y);
    pdf.text(lines, M + 14, y);
    y += lines.length * 11 + 6;
  });
  return y + 4;
}

function table(pdf: jsPDF, y: number, reportTitle: string, section: string, head: string[], rows: unknown[][]) {
  if (!rows.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    head: [head.map((h) => sanitizeConsumerText(h))],
    body: rows.map((row) => row.map((cell) => sanitizeConsumerText(cell))),
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 4, overflow: "linebreak", valign: "top", lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: STRIPE },
    didDrawPage: () => header(pdf, reportTitle, section),
  });
  return ((pdf as JsPdfAuto).lastAutoTable?.finalY ?? y) + 16;
}

function cover(pdf: jsPDF, reportTitle: string, subtitle: string, reportId: string, template: string) {
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, H, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(reportTitle), W - M * 2), M, 145);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(pdf.splitTextToSize(sanitizeConsumerText(subtitle), W - M * 2), M, 220);
  pdf.setFontSize(10);
  pdf.text(`Report ${sanitizeConsumerText(reportId)} · ${sanitizeConsumerText(template)}`, M, 708);
  pdf.text("Confidential · Concept AI", M, 730);
}

export async function exportConsumerReportPdf(fileName: string, payload: Payload): Promise<{ fileName: string }> {
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  const reportTitle = sanitizeConsumerText(inputs.projectName || "Feasibility Study");
  const template = sanitizeConsumerText(validation.template.label);
  const recommendation = sanitizeConsumerText(validation.recommendation);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  cover(pdf, reportTitle, `${sanitizeConsumerText(inputs.industry || "Business concept")} · ${sanitizeConsumerText(inputs.location || "Selected market")}`, report.reportId, template);

  let y = addPage(pdf, reportTitle, "Executive decision summary");
  y = titleBlock(pdf, y, "Executive decision summary", "The report gives the decision first, then the evidence and validation path.", reportTitle);
  y = table(pdf, y, reportTitle, "Executive decision summary", ["Item", "Value"], [["Recommendation", recommendation], ["Project feasibility score", score(report.scores.overall)], ["Analysis confidence", report.research?.confidence ?? "Medium"], ["Report type", template], ["Investment range", report.financials.investmentRange], ["Break-even", report.financials.breakEvenSummary]]);
  y = paragraph(pdf, y, report.executiveSummary, reportTitle, "Executive decision summary");
  y = paragraph(pdf, y, consumerValidationNote, reportTitle, "Executive decision summary");

  y = addPage(pdf, reportTitle, "Concept explanation");
  y = titleBlock(pdf, y, "Concept explanation", "The concept must be clear before market, financial, and risk analysis can be trusted.", reportTitle);
  y = paragraph(pdf, y, inputs.description || report.narrative?.governingThesis || report.executiveSummary, reportTitle, "Concept explanation");
  y = table(pdf, y, reportTitle, "Concept explanation", ["Input", "Value"], [["Strategic objectives", inputs.strategicObjectives || "Validate project value and execution path."], ["Business model", inputs.businessModel || "To be validated"], ["Revenue model", inputs.revenueModel || "To be validated"], ["Target customer", report.customer.ageLocation], ["Buyer need", report.customer.goals]]);

  y = addPage(pdf, reportTitle, "Product workflow");
  y = titleBlock(pdf, y, "Product workflow", "The workflow shows how the solution creates value for users and buyers.", reportTitle);
  y = table(pdf, y, reportTitle, "Product workflow", ["Step", "Purpose"], [["1. Intake", "Capture user or customer need."], ["2. Processing", "Apply product logic, data, workflow, or service layer."], ["3. Decision support", "Turn output into action, recommendation, or measurable result."], ["4. Adoption", "Embed the workflow into daily operations."], ["5. Measurement", "Track value, cost, usage, and risk indicators."]]);

  y = addPage(pdf, reportTitle, "Market context");
  y = titleBlock(pdf, y, "Market context", "Market size is useful only when linked to reachable demand and buyer urgency.", reportTitle);
  y = paragraph(pdf, y, report.research?.overview || "Market assumptions require validation through customer and source-backed research.", reportTitle, "Market context");
  y = bullets(pdf, y, report.research?.keySignals ?? [], reportTitle, "Market context");

  y = addPage(pdf, reportTitle, "TAM SAM SOM");
  y = titleBlock(pdf, y, "TAM SAM SOM", "The project should focus on reachable demand, not only top-down market size.", reportTitle);
  y = table(pdf, y, reportTitle, "TAM SAM SOM", ["Layer", "Value", "CAGR", "Definition"], [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel]]);

  y = addPage(pdf, reportTitle, "Customer problem and value map");
  y = titleBlock(pdf, y, "Customer problem and value map", "A strong feasibility case links customer pain, buying power, and adoption behavior.", reportTitle);
  y = table(pdf, y, reportTitle, "Customer problem and value map", ["Area", "Assessment"], [["Target", report.customer.ageLocation], ["Budget / income", report.customer.income], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Behavior", report.customer.behavior]]);
  y = bullets(pdf, y, report.research?.painPoints ?? [], reportTitle, "Customer problem and value map");

  y = addPage(pdf, reportTitle, "Product architecture");
  y = titleBlock(pdf, y, "Product architecture", "The architecture must match the report type and avoid unnecessary complexity.", reportTitle);
  y = table(pdf, y, reportTitle, "Product architecture", ["Layer", "Role"], [["User interface", "Guided workflow and report/dashboard interaction."], ["Application logic", "Template selection, scoring, workflow, and validation logic."], ["Data layer", "Inputs, report object, source references, and saved reports."], ["AI / analysis layer", "Structured analysis and sector-specific content generation."], ["Governance layer", "Controls for evidence, templates, privacy, and safe sharing."]]);

  y = addPage(pdf, reportTitle, "Competitive positioning");
  y = titleBlock(pdf, y, "Competitive positioning", "The wedge must be specific enough to defend against incumbents.", reportTitle);
  y = table(pdf, y, reportTitle, "Competitive positioning", ["Competitor", "Model", "Weakness", "Project wedge"], (report.competitors || []).map((c) => [c.name, c.model, c.weakness, c.edge]));

  y = addPage(pdf, reportTitle, "FMART scorecard");
  y = titleBlock(pdf, y, "FMART scorecard", "The feasibility score combines financial, market, achievability, risk, timing, and operational factors.", reportTitle);
  y = table(pdf, y, reportTitle, "FMART scorecard", ["Dimension", "Score", "Finding"], [["Financial", score(report.scores.financial), report.scores.financialFinding], ["Market", score(report.scores.market), report.scores.marketFinding], ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding], ["Risk", score(report.scores.risk), report.scores.riskFinding], ["Timing", score(report.scores.timing), report.scores.timingFinding], ["Operational", score(report.scores.operational), report.scores.operationalFinding], ["Overall", score(report.scores.overall), recommendation]]);

  y = addPage(pdf, reportTitle, "Financial assumptions");
  y = titleBlock(pdf, y, "Financial assumptions", "Financial feasibility depends on transparent assumptions and staged validation.", reportTitle);
  y = table(pdf, y, reportTitle, "Financial assumptions", ["Assumption", "Value"], [["Currency", report.financials.currency], ["Investment range", report.financials.investmentRange], ["CapEx low", money(report.financials.capExTotal?.low)], ["CapEx mid", money(report.financials.capExTotal?.mid)], ["CapEx high", money(report.financials.capExTotal?.high)], ["Break-even logic", report.financials.breakEvenSummary], ["LTV:CAC", report.financials.ltvCacRatio ?? "Requires validation"]]);

  y = addPage(pdf, reportTitle, "Unit economics");
  y = titleBlock(pdf, y, "Unit economics", "Unit economics must prove value before scale funding.", reportTitle);
  y = table(pdf, y, reportTitle, "Unit economics", ["Cost area", "Low", "High", "Notes"], (report.financials.capEx || []).map((c) => [c.category, money(c.low), money(c.high), c.notes]));
  y = table(pdf, y, reportTitle, "Unit economics", ["Operating area", "Monthly", "Annual"], (report.financials.opEx || []).map((o) => [o.category, money(o.monthly), money(o.annual)]));

  y = addPage(pdf, reportTitle, "Revenue scenarios");
  y = titleBlock(pdf, y, "Revenue scenarios", "The base case should be credible under realistic adoption and sales-cycle assumptions.", reportTitle);
  y = table(pdf, y, reportTitle, "Revenue scenarios", ["Scenario", "Probability", "Customers", "Annual revenue", "Break-even"], (report.financials.scenarios || []).map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]));

  y = addPage(pdf, reportTitle, "Sensitivity analysis");
  y = titleBlock(pdf, y, "Sensitivity analysis", "Downside cases show what needs control before funding increases.", reportTitle);
  y = table(pdf, y, reportTitle, "Sensitivity analysis", ["Variable", "Downside case", "Likely impact", "Mitigation"], [["ACV", "ACV below plan", "Longer break-even", "Validate paid pilots and buyer budget."], ["CAC", "CAC above plan", "Lower payback quality", "Narrow ICP and partner channels."], ["Churn", "Churn doubles", "Weaker LTV:CAC", "Track activation and customer success."], ["Implementation cost", "Cost above plan", "Lower gross margin", "Standardize delivery scope."], ["Sales cycle", "Cycle extends", "Cash runway pressure", "Use staged pilots and clear procurement path."]]);

  y = addPage(pdf, reportTitle, "Risk register");
  y = titleBlock(pdf, y, "Risk register", "Risks should have clear mitigation and decision impact.", reportTitle);
  y = table(pdf, y, reportTitle, "Risk register", ["Risk", "Probability", "Impact", "Level", "Mitigation"], (report.risks || []).map((r) => [r.name, r.probability, r.impact, r.level, r.mitigation]));

  y = addPage(pdf, reportTitle, "Risk heatmap");
  y = titleBlock(pdf, y, "Risk heatmap", "The highest-exposure risks should drive phase gates.", reportTitle);
  y = table(pdf, y, reportTitle, "Risk heatmap", ["Priority", "Risk", "Exposure", "Gate implication"], (report.risks || []).slice(0, 8).map((r, i) => [String(i + 1), r.name, `${r.probability} probability / ${r.impact} impact`, r.level === "High" ? "Validate before scale funding" : "Track during next phase"]));

  y = addPage(pdf, reportTitle, "Compliance and regulatory path");
  y = titleBlock(pdf, y, "Compliance and regulatory path", "Compliance requirements depend on the selected report type and target buyers.", reportTitle);
  y = table(pdf, y, reportTitle, "Compliance and regulatory path", ["Area", "Requirement"], validation.template.compliance.map((item) => [item, "Confirm owner, evidence, and implementation path before scale funding."]));

  y = addPage(pdf, reportTitle, "GTM strategy");
  y = titleBlock(pdf, y, "GTM strategy", "The go-to-market plan should focus on the first reachable customer segment.", reportTitle);
  y = table(pdf, y, reportTitle, "GTM strategy", ["Channel", "Role"], validation.template.gtmChannels.map((channel) => [channel, "Use for first pilots, buyer validation, and conversion learning."]));
  y = bullets(pdf, y, report.recommendations ?? [], reportTitle, "GTM strategy");

  y = addPage(pdf, reportTitle, "Implementation roadmap");
  y = titleBlock(pdf, y, "Implementation roadmap", "Use staged gates instead of committing full spend upfront.", reportTitle);
  y = table(pdf, y, reportTitle, "Implementation roadmap", ["Phase", "Timeline", "Activities", "Gate", "Metric"], (report.implementationRoadmap?.phases || []).map((p) => [p.phase, p.timeline, p.keyActivities, p.decisionGate, p.successMetric]));
  if (!report.implementationRoadmap?.phases?.length) y = bullets(pdf, y, report.nextSteps ?? [], reportTitle, "Implementation roadmap");

  y = addPage(pdf, reportTitle, "Recommendations and final decision");
  y = titleBlock(pdf, y, "Recommendations and final decision", "The next decision should validate the assumptions that can change the score.", reportTitle);
  y = bullets(pdf, y, report.recommendations ?? [], reportTitle, "Recommendations and final decision");
  y = paragraph(pdf, y, `Final recommendation: ${recommendation}. The project should move forward only through the stated validation gates and funding controls.`, reportTitle, "Recommendations and final decision");

  y = addPage(pdf, reportTitle, "Limitations and assumptions");
  y = titleBlock(pdf, y, "Limitations and assumptions", "The report supports decision-making, but final approval should validate the highest-impact assumptions.", reportTitle);
  y = bullets(pdf, y, [inputs.assumptions || consumerValidationNote, inputs.constraints || "Constraints should be confirmed during the next phase.", inputs.knownRisks || "Known risks should be assigned to owners before execution.", consumerValidationNote], reportTitle, "Limitations and assumptions");

  y = addPage(pdf, reportTitle, "Evidence sources");
  y = titleBlock(pdf, y, "Evidence sources", "Sources help explain confidence and identify what needs validation.", reportTitle);
  y = table(pdf, y, reportTitle, "Evidence sources", ["Evidence label", "Source", "Title", "Supported point"], (report.research?.citations || []).slice(0, 12).map((c) => [sourceQuality(c.source, c.title), c.source, c.title, c.takeaway || "Supports report context."]));
  y = paragraph(pdf, y, consumerValidationNote, reportTitle, "Evidence sources");

  if ((pdf as JsPdfAuto).putTotalPages) (pdf as JsPdfAuto).putTotalPages?.(TOTAL);
  pdf.save(fileName);
  return { fileName };
}
