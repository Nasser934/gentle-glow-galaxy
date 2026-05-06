import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { validateTemplateIntegrity } from "@/lib/reportTemplates";
import { consumerValidationNote, sanitizeConsumerText } from "@/lib/consumerSafety";
import { buildArchitectureRows, buildConceptNarrative, buildHeadSummary, buildValidationPlan, buildWorkflowRows, effectiveAnalysisConfidence, evidenceRows, presentationReportLabel } from "@/lib/reportPresentation";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (value: string) => void };

const TOTAL = "{total_pages_count_string}";
const W = 595.28;
const H = 841.89;
const M = 42;
const NAVY: [number, number, number] = [11, 31, 58];
const BLUE: [number, number, number] = [67, 56, 202];
const ORANGE: [number, number, number] = [245, 158, 11];
const RED: [number, number, number] = [220, 38, 38];
const GREEN: [number, number, number] = [22, 163, 74];
const MUTED: [number, number, number] = [92, 100, 112];
const BORDER: [number, number, number] = [209, 213, 219];
const STRIPE: [number, number, number] = [246, 247, 249];
const drawn = new Set<number>();

const safe = (v: unknown) => sanitizeConsumerText(v);
const score = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)} / 10` : "—";
const money = (v: unknown) => typeof v === "number" ? `USD ${Math.round(v).toLocaleString()}` : safe(v);

function header(pdf: jsPDF, title: string, section: string) {
  const pageNo = pdf.getNumberOfPages();
  if (drawn.has(pageNo)) return;
  drawn.add(pageNo);
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 9, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("CONCEPT AI · PROFESSIONAL FEASIBILITY STUDY", M, 28);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.text(safe(title), W - M, 28, { align: "right" });
  pdf.setDrawColor(...BORDER);
  pdf.line(M, H - 42, W - M, H - 42);
  pdf.setFontSize(7.2);
  pdf.text(`${safe(section)} | Page ${pageNo} of ${TOTAL}`, M, H - 26);
}

function cover(pdf: jsPDF, title: string, subtitle: string, reportId: string, reportType: string) {
  drawn.clear();
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, H, "F");
  pdf.setFillColor(...BLUE);
  pdf.rect(0, 0, 16, H, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(pdf.splitTextToSize(safe(title), W - M * 2), M + 8, 138);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(pdf.splitTextToSize(safe(subtitle), W - M * 2), M + 8, 218);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Professional Feasibility Study & Investment Report", M + 8, 286);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text("20-page consulting-style report with executive decision, market figures, product workflow, architecture, FMART scorecard, financial model, risk heatmap, roadmap, validation plan and source evidence.", M + 8, 308, { maxWidth: W - M * 2 });
  pdf.setFontSize(10);
  pdf.text(`Report ${safe(reportId)} · ${safe(reportType)}`, M + 8, 708);
  pdf.text("Confidential · Concept AI", M + 8, 730);
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
  pdf.text(pdf.splitTextToSize(safe(intro), W - M * 2), M, 90);
  pdf.setDrawColor(...BORDER);
  pdf.line(M, 122, W - M, 122);
  return 146;
}

function para(pdf: jsPDF, y: number, body: unknown, x = M, maxWidth = W - M * 2) {
  const lines = pdf.splitTextToSize(safe(body), maxWidth) as string[];
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(lines, x, y);
  return y + lines.length * 11 + 10;
}

function table(pdf: jsPDF, y: number, title: string, section: string, head: string[], rows: unknown[][]) {
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M, top: 54, bottom: 58 },
    head: [head],
    body: rows.map((row) => row.map((cell) => safe(cell))),
    styles: { font: "helvetica", fontSize: 7.4, cellPadding: 4, overflow: "linebreak", valign: "top", lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: STRIPE },
    didDrawPage: () => header(pdf, title, section),
  });
  return ((pdf as PdfWithTable).lastAutoTable?.finalY ?? y) + 16;
}

function kpi(pdf: jsPDF, x: number, y: number, width: number, label: string, value: string, sub = "") {
  pdf.setDrawColor(...BORDER);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, width, 76, 8, 8, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...MUTED);
  pdf.text(label.toUpperCase(), x + 12, y + 18);
  pdf.setFontSize(16);
  pdf.setTextColor(...NAVY);
  pdf.text(pdf.splitTextToSize(safe(value), width - 24), x + 12, y + 42);
  if (sub) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.2);
    pdf.setTextColor(...MUTED);
    pdf.text(pdf.splitTextToSize(safe(sub), width - 24), x + 12, y + 63);
  }
}

function scoreBars(pdf: jsPDF, y: number, report: FeasibilityReport) {
  const rows = [
    ["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability],
    ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational],
  ] as const;
  rows.forEach(([label, value], index) => {
    const yy = y + index * 42;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...NAVY);
    pdf.text(label, M, yy);
    pdf.text(score(value), W - M, yy, { align: "right" });
    pdf.setFillColor(232, 235, 244);
    pdf.roundedRect(M, yy + 10, W - M * 2, 9, 4, 4, "F");
    pdf.setFillColor(...BLUE);
    pdf.roundedRect(M, yy + 10, (W - M * 2) * (Math.max(0, Math.min(10, value)) / 10), 9, 4, 4, "F");
  });
  return y + rows.length * 42 + 12;
}

function marketFunnel(pdf: jsPDF, y: number, report: FeasibilityReport) {
  const rows = [
    ["TAM", report.market.tamValue, report.market.tamLabel, 1],
    ["SAM", report.market.samValue, report.market.samLabel, 0.72],
    ["SOM", report.market.somValue, report.market.somLabel, 0.44],
  ] as const;
  rows.forEach(([label, value, sub, ratio], index) => {
    const width = (W - M * 2) * Number(ratio);
    const x = M + ((W - M * 2) - width) / 2;
    const yy = y + index * 62;
    const color = index === 0 ? BLUE : index === 1 ? ORANGE : GREEN;
    pdf.setFillColor(...color);
    pdf.roundedRect(x, yy, width, 40, 8, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`${label} · ${safe(value)}`, x + 12, yy + 16);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(pdf.splitTextToSize(safe(sub), width - 24), x + 12, yy + 30);
  });
  return y + 196;
}

function workflowFigure(pdf: jsPDF, y: number, rows: ReturnType<typeof buildWorkflowRows>) {
  const boxW = 96;
  const gap = 7;
  rows.slice(0, 5).forEach((row, index) => {
    const x = M + index * (boxW + gap);
    pdf.setDrawColor(...BORDER);
    pdf.setFillColor(...STRIPE);
    pdf.roundedRect(x, y, boxW, 132, 8, 8, "FD");
    pdf.setFillColor(...BLUE);
    pdf.circle(x + 14, y + 16, 10, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(String(index + 1), x + 14, y + 19, { align: "center" });
    pdf.setTextColor(...NAVY);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(safe(row.activity), boxW - 16), x + 8, y + 42);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.7);
    pdf.text(pdf.splitTextToSize(`Output: ${safe(row.output)}`, boxW - 16), x + 8, y + 78);
    if (index < rows.length - 1) {
      pdf.setTextColor(...MUTED);
      pdf.setFontSize(12);
      pdf.text("→", x + boxW + 1, y + 68);
    }
  });
  return y + 156;
}

function architectureFigure(pdf: jsPDF, y: number, rows: ReturnType<typeof buildArchitectureRows>) {
  rows.slice(0, 6).forEach((row, index) => {
    const yy = y + index * 47;
    pdf.setDrawColor(...BORDER);
    pdf.setFillColor(index % 2 ? 255 : 246, index % 2 ? 255 : 247, index % 2 ? 255 : 249);
    pdf.roundedRect(M, yy, W - M * 2, 38, 7, 7, "FD");
    pdf.setTextColor(...NAVY);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.6);
    pdf.text(safe(row.label), M + 12, yy + 15);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.4);
    pdf.text(pdf.splitTextToSize(safe(row.value), W - M * 2 - 170), M + 165, yy + 14);
  });
  return y + rows.slice(0, 6).length * 47 + 10;
}

function riskHeatmap(pdf: jsPDF, y: number, report: FeasibilityReport) {
  const size = 82;
  const startX = M + 118;
  const impacts = ["High", "Med", "Low"];
  const probs = ["Low", "Med", "High"];
  impacts.forEach((impact, rowIndex) => probs.forEach((prob, colIndex) => {
    const x = startX + colIndex * size;
    const yy = y + rowIndex * size;
    const color = impact === "High" && prob !== "Low" ? RED : impact === "Low" && prob === "Low" ? GREEN : ORANGE;
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.setDrawColor(...BORDER);
    pdf.rect(x, yy, size, size, "FD");
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x + 2, yy + 2, size - 4, size - 4, "F");
    const found = report.risks.find((risk) => risk.impact === impact && risk.probability === prob);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.text(`P ${prob} · I ${impact}`, x + 6, yy + 12);
    if (found) {
      pdf.setTextColor(...NAVY);
      pdf.setFontSize(7.2);
      pdf.text(pdf.splitTextToSize(safe(found.name), size - 12), x + 6, yy + 30);
    }
  }));
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Probability →", startX + 78, y + 262);
  pdf.text("Impact", M + 22, y + 126, { angle: 90 });
  return y + 282;
}

function bullets(pdf: jsPDF, y: number, items: unknown[]) {
  items.filter(Boolean).slice(0, 10).forEach((item) => {
    const lines = pdf.splitTextToSize(safe(item), W - M * 2 - 14) as string[];
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
  const title = safe(inputs.projectName || "Feasibility Study");
  const reportLabel = presentationReportLabel(inputs, report);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const workflow = buildWorkflowRows(inputs, report);
  const architecture = buildArchitectureRows(inputs, report);
  const validationPlan = buildValidationPlan(inputs, report);
  const evidence = evidenceRows(report);

  cover(pdf, title, `${safe(inputs.industry || "Business concept")} · ${safe(inputs.location || "Selected market")}`, report.reportId, reportLabel);

  let y = page(pdf, title, "Executive decision", "Decision-first view with recommendation, score, confidence and funding gate.");
  kpi(pdf, M, y, 150, "Recommendation", validation.recommendation, reportLabel);
  kpi(pdf, M + 165, y, 110, "Score", score(report.scores.overall), "FMART weighted");
  kpi(pdf, M + 290, y, 110, "Confidence", confidence.label, confidence.sub);
  kpi(pdf, M + 415, y, 96, "Sources", String(report.research?.citations?.length ?? 0), "Evidence items");
  y += 104;
  y = para(pdf, y, report.executiveSummary);

  y = page(pdf, title, "Board-level executive brief", "Answers the main executive questions before the detailed analysis.");
  y = table(pdf, y, title, "Board-level executive brief", ["Executive question", "Answer"], buildHeadSummary(inputs, report).map((r) => [r.label, r.value]));

  y = page(pdf, title, "Detailed concept explanation", "Explains the idea before analysis so the output is not a generic template.");
  buildConceptNarrative(inputs, report).forEach((p) => { y = para(pdf, y, p); });
  y = table(pdf, y, title, "Detailed concept explanation", ["Input", "Value"], [["Project description", inputs.description || report.executiveSummary], ["Strategic objectives", inputs.strategicObjectives || "Validate project value and execution path."], ["Business model", inputs.businessModel || "To be validated"], ["Revenue model", inputs.revenueModel || "To be validated"], ["Buyer need", report.customer.goals]]);

  y = page(pdf, title, "Product workflow figure", "Visual workflow showing how the product converts inputs into customer value.");
  y = workflowFigure(pdf, y, workflow);
  y = table(pdf, y, title, "Product workflow figure", ["Step", "Input", "Activity", "Output", "Control"], workflow.map((r) => [r.step, r.input, r.activity, r.output, r.control]));

  y = page(pdf, title, "Architecture figure", "Platform layers required to operate and scale the product.");
  y = architectureFigure(pdf, y, architecture);
  y = table(pdf, y, title, "Architecture figure", ["Layer", "Role"], architecture.map((r) => [r.label, r.value]));

  y = page(pdf, title, "Market funnel figure", "TAM, SAM and SOM view that connects opportunity size to reachable demand.");
  y = marketFunnel(pdf, y, report);
  y = table(pdf, y, title, "Market funnel figure", ["Layer", "Value", "CAGR", "Definition"], [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel]]);

  y = page(pdf, title, "Customer value map", "Target customer, buying trigger, willingness to pay and behavior.");
  y = table(pdf, y, title, "Customer value map", ["Area", "Assessment"], [["Target customer", report.customer.ageLocation], ["Budget / income", report.customer.income], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Behavior", report.customer.behavior]]);

  y = page(pdf, title, "Competitive positioning", "Competitor set, weaknesses and project wedge.");
  y = table(pdf, y, title, "Competitive positioning", ["Competitor", "Model", "Weakness", "Project wedge"], (report.competitors || []).map((c) => [c.name, c.model, c.weakness, c.edge]));

  y = page(pdf, title, "FMART score figure", "Visual feasibility score across financial, market, achievability, risk, timing and operational dimensions.");
  y = scoreBars(pdf, y, report);
  y = table(pdf, y, title, "FMART score figure", ["Dimension", "Score", "Finding"], [["Financial", score(report.scores.financial), report.scores.financialFinding], ["Market", score(report.scores.market), report.scores.marketFinding], ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding], ["Risk", score(report.scores.risk), report.scores.riskFinding], ["Timing", score(report.scores.timing), report.scores.timingFinding], ["Operational", score(report.scores.operational), report.scores.operationalFinding], ["Overall", score(report.scores.overall), validation.recommendation]]);

  y = page(pdf, title, "Financial model", "Investment range, CapEx, OpEx, unit economics and break-even logic.");
  y = table(pdf, y, title, "Financial model", ["Assumption", "Value"], [["Currency", report.financials.currency], ["Investment range", report.financials.investmentRange], ["CapEx low", money(report.financials.capExTotal?.low)], ["CapEx mid", money(report.financials.capExTotal?.mid)], ["CapEx high", money(report.financials.capExTotal?.high)], ["Break-even", report.financials.breakEvenSummary], ["LTV:CAC", report.financials.ltvCacRatio ?? "Requires validation"]]);

  y = page(pdf, title, "Revenue scenarios", "Optimistic, base and pessimistic revenue scenarios.");
  y = table(pdf, y, title, "Revenue scenarios", ["Scenario", "Probability", "Customers", "Annual revenue", "Break-even"], report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]));

  y = page(pdf, title, "CapEx and OpEx detail", "Cost structure used to assess cash need and operating runway.");
  y = table(pdf, y, title, "CapEx and OpEx detail", ["CapEx area", "Low", "High", "Notes"], report.financials.capEx.map((c) => [c.category, money(c.low), money(c.high), c.notes]));
  y = table(pdf, y, title, "CapEx and OpEx detail", ["OpEx area", "Monthly", "Annual"], report.financials.opEx.map((o) => [o.category, money(o.monthly), money(o.annual)]));

  y = page(pdf, title, "Sensitivity view", "Key assumptions that can move the recommendation.");
  y = table(pdf, y, title, "Sensitivity view", ["Variable", "Downside case", "Likely impact", "Mitigation"], [["Demand", "Buyer adoption below plan", "Longer payback", "Narrow the first segment and run paid pilots."], ["Pricing", "Lower willingness to pay", "Lower contribution margin", "Validate pricing during pilot contracts."], ["Cost", "Implementation or operating cost rises", "Break-even delay", "Use phase gates and vendor controls."], ["Retention", "Repeat use below target", "Weak LTV:CAC", "Track cohorts and improve onboarding."]]);

  y = page(pdf, title, "Risk heatmap figure", "Visual risk map by probability and impact.");
  y = riskHeatmap(pdf, y, report);
  y = table(pdf, y, title, "Risk heatmap figure", ["Priority", "Risk", "Gate implication"], report.risks.slice(0, 8).map((r, i) => [String(i + 1), r.name, r.level === "High" ? "Validate before scale funding" : "Track during next phase"]));

  y = page(pdf, title, "Risk register", "Risk commentary converted into mitigation actions.");
  y = table(pdf, y, title, "Risk register", ["Risk", "Probability", "Impact", "Level", "Mitigation"], report.risks.map((r) => [r.name, r.probability, r.impact, r.level, r.mitigation]));

  y = page(pdf, title, "GTM strategy", "Channels and first validation path for customer acquisition.");
  y = table(pdf, y, title, "GTM strategy", ["Channel", "Role"], validation.template.gtmChannels.map((c) => [c, "Use for pilots, buyer validation and conversion learning."]));

  y = page(pdf, title, "Validation plan", "Required proof points before scale funding.");
  y = table(pdf, y, title, "Validation plan", ["Validation area", "Required proof"], validationPlan.map((r) => [r.label, r.value]));

  y = page(pdf, title, "Implementation roadmap", "Stage-gate roadmap for controlled execution.");
  if (report.implementationRoadmap?.phases?.length) y = table(pdf, y, title, "Implementation roadmap", ["Phase", "Timeline", "Activities", "Gate", "Metric"], report.implementationRoadmap.phases.map((p) => [p.phase, p.timeline, p.keyActivities, p.decisionGate, p.successMetric]));
  else y = bullets(pdf, y, report.nextSteps ?? []);

  y = page(pdf, title, "Strategic recommendations", "Actions recommended for the next decision cycle.");
  y = table(pdf, y, title, "Strategic recommendations", ["#", "Recommendation"], report.recommendations.map((r, i) => [String(i + 1), r]));
  y = bullets(pdf, y, report.nextSteps ?? []);

  y = page(pdf, title, "Evidence and sources", "Source evidence used by the report, or explicit gaps where evidence is missing.");
  y = table(pdf, y, title, "Evidence and sources", ["Evidence label", "Source / gap", "Supported point"], evidence.map((r) => [r.label, r.value, r.note || "Supports report context."]));
  y = para(pdf, y, consumerValidationNote);

  y = page(pdf, title, "Final decision", "Final recommendation and approval conditions.");
  y = para(pdf, y, `Final recommendation: ${validation.recommendation}. Proceed only through validation gates and funding controls. Validate market size, unit economics, operational readiness and risk exposure before scale funding.`);
  y = table(pdf, y, title, "Final decision", ["Decision item", "Condition"], [["Funding", "Release funding by phase, not all upfront."], ["Market", "Validate reachable buyers and conversion."], ["Financial", "Validate margin, payback and break-even."], ["Risk", "Assign owners and gates for high-impact risks."]]);

  if ((pdf as PdfWithTable).putTotalPages) (pdf as PdfWithTable).putTotalPages?.(TOTAL);
  pdf.save(fileName);
  return { fileName };
}
