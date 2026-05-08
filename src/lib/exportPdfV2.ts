import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type PdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

type PdfExportPayload = {
  report: FeasibilityReport;
  inputs: ConceptInputs;
};

const page = {
  width: 595.28,
  height: 841.89,
  margin: 44,
};

const colors = {
  primary: [31, 78, 216] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const setTextColor = (pdf: jsPDF, color: [number, number, number]) => pdf.setTextColor(color[0], color[1], color[2]);
const setFillColor = (pdf: jsPDF, color: [number, number, number]) => pdf.setFillColor(color[0], color[1], color[2]);
const setDrawColor = (pdf: jsPDF, color: [number, number, number]) => pdf.setDrawColor(color[0], color[1], color[2]);
const lastTableY = (pdf: jsPDF, fallback: number) => (pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? fallback;

function addHeaderFooter(pdf: jsPDF, title: string, reportId: string) {
  setTextColor(pdf, colors.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", page.margin, 30);

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.text(title, page.width - page.margin, 30, { align: "right" });

  setDrawColor(pdf, colors.border);
  pdf.line(page.margin, page.height - 42, page.width - page.margin, page.height - 42);
  pdf.setFontSize(7.5);
  pdf.text(`Report ${reportId}`, page.margin, page.height - 26);
  pdf.text("AI-generated. Not financial advice.", page.width - page.margin, page.height - 26, { align: "right" });
}

function addPage(pdf: jsPDF, title: string, reportId: string) {
  pdf.addPage();
  addHeaderFooter(pdf, title, reportId);
  return 62;
}

function paragraph(pdf: jsPDF, y: number, text: string, maxWidth = page.width - page.margin * 2) {
  if (!text) return y;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  setTextColor(pdf, colors.text);
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  pdf.text(lines, page.margin, y);
  return y + lines.length * 13 + 8;
}

function section(pdf: jsPDF, y: number, label: string) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  setTextColor(pdf, colors.primary);
  pdf.text(label.toUpperCase(), page.margin, y);
  return y + 18;
}

function ensurePage(pdf: jsPDF, y: number, needed: number, title: string, reportId: string) {
  return y + needed > page.height - 60 ? addPage(pdf, title, reportId) : y;
}

function drawCover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs) {
  setFillColor(pdf, colors.primary);
  pdf.rect(0, 0, page.width, 118, "F");
  setTextColor(pdf, colors.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("CONCEPT AI", page.margin, 46);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Confidential feasibility analysis", page.margin, 64);

  let y = 190;
  setTextColor(pdf, colors.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(27);
  const title = pdf.splitTextToSize(inputs.projectName || "Untitled Project", page.width - page.margin * 2) as string[];
  pdf.text(title, page.margin, y);
  y += title.length * 32 + 18;

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text([inputs.industry, inputs.location].filter(Boolean).join(" · "), page.margin, y);
  y += 42;

  const metrics: Array<[string, string]> = [
    ["Verdict", report.scores.verdict],
    ["Overall Score", `${report.scores.overall.toFixed(1)} / 10`],
    ["Investment", report.financials.investmentRange],
    ["Break-even", report.financials.breakEvenSummary],
  ];

  metrics.forEach(([name, value]) => {
    setFillColor(pdf, colors.surface);
    setDrawColor(pdf, colors.border);
    pdf.roundedRect(page.margin, y, page.width - page.margin * 2, 46, 5, 5, "FD");
    setTextColor(pdf, colors.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(name.toUpperCase(), page.margin + 14, y + 17);
    setTextColor(pdf, colors.text);
    pdf.setFontSize(13);
    pdf.text(value || "—", page.margin + 150, y + 24);
    y += 56;
  });

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Report ID: ${report.reportId}`, page.margin, page.height - 44);
  pdf.text(report.dateIssued || new Date().toISOString().slice(0, 10), page.width - page.margin, page.height - 44, { align: "right" });
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  drawCover(pdf, report, inputs);

  let y = addPage(pdf, inputs.projectName || "Untitled", report.reportId);
  y = section(pdf, y, "Executive Summary");
  y = paragraph(pdf, y, report.executiveSummary);

  y = ensurePage(pdf, y, 160, inputs.projectName, report.reportId);
  y = section(pdf, y, "FMART Scoring");
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head: [["Dimension", "Score", "Finding"]],
    body: [
      ["Financial", report.scores.financial.toFixed(1), report.scores.financialFinding],
      ["Market", report.scores.market.toFixed(1), report.scores.marketFinding],
      ["Achievability", report.scores.achievability.toFixed(1), report.scores.achievabilityFinding],
      ["Risk", report.scores.risk.toFixed(1), report.scores.riskFinding],
      ["Timing", report.scores.timing.toFixed(1), report.scores.timingFinding],
      ["Operational", report.scores.operational.toFixed(1), report.scores.operationalFinding],
    ],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: colors.text, lineColor: colors.border, lineWidth: 0.3 },
    headStyles: { fillColor: colors.primary, textColor: colors.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: colors.surface },
    didDrawPage: () => addHeaderFooter(pdf, inputs.projectName, report.reportId),
  });
  y = lastTableY(pdf, y) + 16;

  y = ensurePage(pdf, y, 160, inputs.projectName, report.reportId);
  y = section(pdf, y, "Market and Customer");
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    body: [
      ["TAM", `${report.market.tamValue} (${report.market.tamCagr})`],
      ["SAM", `${report.market.samValue} (${report.market.samCagr})`],
      ["SOM", `${report.market.somValue} (${report.market.somCagr})`],
      ["Customer", report.customer.goals],
      ["Willingness to Pay", report.customer.willingnessToPay],
    ],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: colors.text, lineColor: colors.border, lineWidth: 0.3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130, fillColor: colors.surface } },
    didDrawPage: () => addHeaderFooter(pdf, inputs.projectName, report.reportId),
  });
  y = lastTableY(pdf, y) + 16;

  y = ensurePage(pdf, y, 180, inputs.projectName, report.reportId);
  y = section(pdf, y, "Financial Plan");
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head: [["CapEx Category", "Low", "High", "Notes"]],
    body: report.financials.capEx.map((item) => [item.category, item.low.toLocaleString(), item.high.toLocaleString(), item.notes]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: colors.text, lineColor: colors.border, lineWidth: 0.3 },
    headStyles: { fillColor: colors.primary, textColor: colors.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: colors.surface },
    didDrawPage: () => addHeaderFooter(pdf, inputs.projectName, report.reportId),
  });
  y = lastTableY(pdf, y) + 16;

  y = ensurePage(pdf, y, 160, inputs.projectName, report.reportId);
  y = section(pdf, y, "Risks");
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head: [["Risk", "Probability", "Impact", "Level", "Mitigation"]],
    body: report.risks.map((risk) => [risk.name, risk.probability, risk.impact, risk.level, risk.mitigation]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: colors.text, lineColor: colors.border, lineWidth: 0.3 },
    headStyles: { fillColor: colors.primary, textColor: colors.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: colors.surface },
    didDrawPage: () => addHeaderFooter(pdf, inputs.projectName, report.reportId),
  });
  y = lastTableY(pdf, y) + 16;

  y = ensurePage(pdf, y, 130, inputs.projectName, report.reportId);
  y = section(pdf, y, "Recommendations and Next Steps");
  y = paragraph(pdf, y, report.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n"));
  y = paragraph(pdf, y, report.nextSteps.map((item, index) => `${index + 1}. ${item}`).join("\n"));

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
