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
  bottom: 62,
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

function clean(value: unknown, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString() : "—";
}

function formatMoney(currency: string, value: number) {
  const label = currency || "USD";
  return Number.isFinite(value) ? `${label} ${value.toLocaleString()}` : "—";
}

function formatScore(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)} / 10` : "—";
}

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value > 100 && value <= 10000) return `${Math.round(value / 100)}%`;
  if (value <= 1) return `${Math.round(value * 100)}%`;
  return `${Math.round(value)}%`;
}

function addHeaderFooter(pdf: jsPDF, title: string, reportId: string) {
  setTextColor(pdf, colors.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", page.margin, 30);

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.text(title || "Untitled", page.width - page.margin, 30, { align: "right" });

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

function ensurePage(pdf: jsPDF, y: number, needed: number, title: string, reportId: string) {
  return y + needed > page.height - page.bottom ? addPage(pdf, title, reportId) : y;
}

function section(pdf: jsPDF, y: number, label: string, title: string, reportId: string) {
  y = ensurePage(pdf, y, 34, title, reportId);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  setTextColor(pdf, colors.primary);
  pdf.text(label.toUpperCase(), page.margin, y);
  return y + 18;
}

function paragraph(pdf: jsPDF, y: number, text: string, title: string, reportId: string, maxWidth = page.width - page.margin * 2) {
  const body = clean(text, "");
  if (!body) return y;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.2);
  setTextColor(pdf, colors.text);

  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  let nextY = y;
  blocks.forEach((block) => {
    const lines = pdf.splitTextToSize(block.replace(/\n/g, " "), maxWidth) as string[];
    nextY = ensurePage(pdf, nextY, lines.length * 12 + 10, title, reportId);
    pdf.text(lines, page.margin, nextY);
    nextY += lines.length * 12 + 8;
  });
  return nextY;
}

function bulletList(pdf: jsPDF, y: number, items: string[] | undefined, title: string, reportId: string) {
  if (!items?.length) return y;
  let nextY = y;
  items.forEach((item) => {
    const lines = pdf.splitTextToSize(clean(item), page.width - page.margin * 2 - 16) as string[];
    nextY = ensurePage(pdf, nextY, lines.length * 11 + 8, title, reportId);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    setTextColor(pdf, colors.text);
    pdf.text("•", page.margin, nextY);
    pdf.text(lines, page.margin + 14, nextY);
    nextY += lines.length * 11 + 6;
  });
  return nextY + 4;
}

function numberedList(pdf: jsPDF, y: number, items: string[] | undefined, title: string, reportId: string) {
  if (!items?.length) return y;
  let nextY = y;
  items.forEach((item, index) => {
    const lines = pdf.splitTextToSize(clean(item), page.width - page.margin * 2 - 22) as string[];
    nextY = ensurePage(pdf, nextY, lines.length * 11 + 8, title, reportId);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    setTextColor(pdf, colors.text);
    pdf.text(`${index + 1}.`, page.margin, nextY);
    pdf.text(lines, page.margin + 20, nextY);
    nextY += lines.length * 11 + 6;
  });
  return nextY + 4;
}

function table(
  pdf: jsPDF,
  y: number,
  title: string,
  reportId: string,
  head: string[][],
  body: Array<Array<string | number>>,
  options: { fontSize?: number; firstColumnWidth?: number } = {},
) {
  if (!body.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head,
    body,
    styles: {
      font: "helvetica",
      fontSize: options.fontSize ?? 8,
      cellPadding: 4,
      textColor: colors.text,
      lineColor: colors.border,
      lineWidth: 0.3,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: { fillColor: colors.primary, textColor: colors.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: colors.surface },
    columnStyles: options.firstColumnWidth ? { 0: { cellWidth: options.firstColumnWidth, fontStyle: "bold" } } : undefined,
    didDrawPage: () => addHeaderFooter(pdf, title, reportId),
  });
  return lastTableY(pdf, y) + 16;
}

function fieldTable(pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) {
  return table(pdf, y, title, reportId, [["Field", "Details"]], rows, { firstColumnWidth: 128, fontSize: 8.2 });
}

function drawCover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs) {
  setFillColor(pdf, colors.primary);
  pdf.rect(0, 0, page.width, 122, "F");
  setTextColor(pdf, colors.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("CONCEPT AI", page.margin, 46);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(clean(report.classification, "Confidential") + " feasibility analysis", page.margin, 64);

  let y = 186;
  setTextColor(pdf, colors.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(27);
  const titleLines = pdf.splitTextToSize(inputs.projectName || "Untitled Project", page.width - page.margin * 2) as string[];
  pdf.text(titleLines, page.margin, y);
  y += titleLines.length * 32 + 16;

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text([inputs.industry, inputs.location].filter(Boolean).join(" · ") || "Feasibility Report", page.margin, y);
  y += 42;

  const metrics: Array<[string, string]> = [
    ["Verdict", clean(report.scores.verdict)],
    ["Overall Score", formatScore(report.scores.overall)],
    ["Investment", clean(report.financials.investmentRange)],
    ["Break-even", clean(report.financials.breakEvenSummary)],
    ["Market TAM", `${clean(report.market.tamValue)} (${clean(report.market.tamCagr)})`],
  ];

  metrics.forEach(([name, value]) => {
    setFillColor(pdf, colors.surface);
    setDrawColor(pdf, colors.border);
    pdf.roundedRect(page.margin, y, page.width - page.margin * 2, 43, 5, 5, "FD");
    setTextColor(pdf, colors.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(name.toUpperCase(), page.margin + 14, y + 16);
    setTextColor(pdf, colors.text);
    pdf.setFontSize(11.5);
    const lines = pdf.splitTextToSize(value, page.width - page.margin * 2 - 165) as string[];
    pdf.text(lines.slice(0, 2), page.margin + 150, y + 20);
    y += 52;
  });

  setTextColor(pdf, colors.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(`Report ID: ${clean(report.reportId)}`, page.margin, page.height - 60);
  pdf.text(`Date Issued: ${clean(report.dateIssued)}`, page.margin, page.height - 44);
  pdf.text(`Prepared by: ${clean(report.preparedBy)}`, page.width - page.margin, page.height - 60, { align: "right" });
  pdf.text(clean(report.methodology), page.width - page.margin, page.height - 44, { align: "right" });
}

function scoringRows(report: FeasibilityReport) {
  return [
    ["Financial Feasibility", formatScore(report.scores.financial), clean(report.scores.financialFinding)],
    ["Market Attractiveness", formatScore(report.scores.market), clean(report.scores.marketFinding)],
    ["Technical Achievability", formatScore(report.scores.achievability), clean(report.scores.achievabilityFinding)],
    ["Operational Feasibility", formatScore(report.scores.operational), clean(report.scores.operationalFinding)],
    ["Risk Level (inverse)", formatScore(report.scores.risk), clean(report.scores.riskFinding)],
    ["Market Timing", formatScore(report.scores.timing), clean(report.scores.timingFinding)],
    ["Overall Weighted Score", formatScore(report.scores.overall), clean(report.scores.verdict)],
  ];
}

function methodologyRows(report: FeasibilityReport) {
  const weights = report.scores.weights;
  const confidence = report.scores.confidence;
  const rationale = report.scores.rationale;
  if (!weights && !confidence && !rationale) return [];
  const dimensions = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return dimensions.map((dimension) => [
    dimension.charAt(0).toUpperCase() + dimension.slice(1),
    formatPercent(weights?.[dimension]),
    formatPercent(confidence?.[dimension]),
    clean(rationale?.[dimension]),
  ]);
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  drawCover(pdf, report, inputs);

  let y = addPage(pdf, title, reportId);

  y = section(pdf, y, "1. Project Brief", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [
    ["Project", clean(inputs.projectName)],
    ["Industry", clean(inputs.industry)],
    ["Location", clean(inputs.location)],
    ["Business Model", clean(inputs.businessModel)],
    ["Revenue Model", clean(inputs.revenueModel)],
    ["Budget Range", clean(inputs.budgetRange)],
    ["Timeline", clean(inputs.timeline)],
    ["Team Size", clean(inputs.teamSize)],
    ["Technology Readiness", clean(inputs.technologyReadiness)],
    ["Founder Experience", clean(inputs.founderExperience)],
  ]);
  y = section(pdf, y, "Concept Description", title, reportId);
  y = paragraph(pdf, y, inputs.description, title, reportId);
  y = section(pdf, y, "Strategic Objectives", title, reportId);
  y = paragraph(pdf, y, inputs.strategicObjectives, title, reportId);
  y = section(pdf, y, "Assumptions", title, reportId);
  y = paragraph(pdf, y, inputs.assumptions, title, reportId);
  y = section(pdf, y, "Constraints", title, reportId);
  y = paragraph(pdf, y, inputs.constraints, title, reportId);
  y = section(pdf, y, "Success Factors", title, reportId);
  y = paragraph(pdf, y, inputs.successFactors, title, reportId);
  y = section(pdf, y, "Known Risks Input", title, reportId);
  y = paragraph(pdf, y, inputs.knownRisks, title, reportId);
  y = section(pdf, y, "Regulatory Considerations", title, reportId);
  y = paragraph(pdf, y, inputs.regulatoryConsiderations, title, reportId);
  y = section(pdf, y, "Dependencies", title, reportId);
  y = paragraph(pdf, y, inputs.dependencies, title, reportId);

  y = section(pdf, y, "2. Executive Summary", title, reportId);
  y = paragraph(pdf, y, report.executiveSummary, title, reportId);

  y = section(pdf, y, "FMART Scoring Overview", title, reportId);
  y = table(pdf, y, title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { firstColumnWidth: 122, fontSize: 7.8 });

  const methodology = methodologyRows(report);
  if (methodology.length) {
    y = section(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId);
    y = table(pdf, y, title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], methodology, { firstColumnWidth: 90, fontSize: 7.7 });
  }

  y = section(pdf, y, "3. Market Analysis", title, reportId);
  y = section(pdf, y, "3.1 Market Sizing (TAM · SAM · SOM)", title, reportId);
  y = table(pdf, y, title, reportId, [["Tier", "Label", "Value", "CAGR"]], [
    ["TAM", clean(report.market.tamLabel), clean(report.market.tamValue), clean(report.market.tamCagr)],
    ["SAM", clean(report.market.samLabel), clean(report.market.samValue), clean(report.market.samCagr)],
    ["SOM", clean(report.market.somLabel), clean(report.market.somValue), clean(report.market.somCagr)],
  ], { firstColumnWidth: 50, fontSize: 8 });

  if (report.market.growthChart?.length) {
    y = section(pdf, y, "Market Growth Projection", title, reportId);
    y = table(pdf, y, title, reportId, [["Year", `TAM (${report.market.currency || "currency"})`, `SAM (${report.market.currency || "currency"})`]], report.market.growthChart.map((row) => [row.year, formatNumber(row.tam), formatNumber(row.sam)]), { firstColumnWidth: 80, fontSize: 8 });
  }

  y = section(pdf, y, "3.2 Customer Profile", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [
    ["Age & Location", clean(report.customer.ageLocation)],
    ["Income", clean(report.customer.income)],
    ["Goals", clean(report.customer.goals)],
    ["Willingness to Pay", clean(report.customer.willingnessToPay)],
    ["Behavior", clean(report.customer.behavior)],
  ]);

  if (report.competitors?.length) {
    y = section(pdf, y, "3.3 Competitive Landscape", title, reportId);
    y = table(pdf, y, title, reportId, [["Competitor", "Model", "Weakness", "Our Edge"]], report.competitors.map((c) => [clean(c.name), clean(c.model), clean(c.weakness), clean(c.edge)]), { firstColumnWidth: 72, fontSize: 7.5 });
  }

  if (report.research) {
    y = section(pdf, y, "3.4 Market Research & Signals", title, reportId);
    y = paragraph(pdf, y, report.research.overview, title, reportId);
    y = fieldTable(pdf, y, title, reportId, [
      ["Confidence", clean(report.research.confidence)],
      ["Sentiment", clean(report.research.sentiment)],
    ]);
    y = section(pdf, y, "Key Signals", title, reportId);
    y = bulletList(pdf, y, report.research.keySignals, title, reportId);
    y = section(pdf, y, "Pain Points", title, reportId);
    y = bulletList(pdf, y, report.research.painPoints, title, reportId);
    y = section(pdf, y, "Competitor Mentions", title, reportId);
    y = bulletList(pdf, y, report.research.competitorMentions, title, reportId);
    y = section(pdf, y, "Reddit Signals", title, reportId);
    y = bulletList(pdf, y, report.research.redditSignals, title, reportId);
    y = section(pdf, y, "Web Signals", title, reportId);
    y = bulletList(pdf, y, report.research.webSignals, title, reportId);

    if (report.research.citations?.length) {
      y = section(pdf, y, "Citations", title, reportId);
      y = table(pdf, y, title, reportId, [["Source", "Title", "Takeaway", "URL"]], report.research.citations.map((citation) => [clean(citation.source), clean(citation.title), clean(citation.takeaway), clean(citation.url)]), { firstColumnWidth: 60, fontSize: 6.8 });
    }
  }

  y = section(pdf, y, "4. Financial Analysis", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [
    ["Investment Range", clean(report.financials.investmentRange)],
    ["Break-Even", clean(report.financials.breakEvenSummary)],
    ["LTV : CAC", clean(report.financials.ltvCacRatio)],
    ["CapEx Low", formatMoney(report.financials.currency, report.financials.capExTotal.low)],
    ["CapEx Mid", formatMoney(report.financials.currency, report.financials.capExTotal.mid)],
    ["CapEx High", formatMoney(report.financials.currency, report.financials.capExTotal.high)],
  ]);

  if (report.financials.capEx?.length) {
    y = section(pdf, y, "4.1 Capital Expenditure", title, reportId);
    y = table(pdf, y, title, reportId, [["Category", "Low", "High", "Notes"]], report.financials.capEx.map((item) => [clean(item.category), formatNumber(item.low), formatNumber(item.high), clean(item.notes)]), { firstColumnWidth: 132, fontSize: 7.7 });
  }

  if (report.financials.opEx?.length) {
    y = section(pdf, y, "4.2 Operating Expenses", title, reportId);
    y = table(pdf, y, title, reportId, [["Category", "Monthly", "Annual"]], report.financials.opEx.map((item) => [clean(item.category), formatNumber(item.monthly), formatNumber(item.annual)]), { firstColumnWidth: 220, fontSize: 8 });
  }

  if (report.financials.scenarios?.length) {
    y = section(pdf, y, "4.3 Revenue Scenarios", title, reportId);
    y = table(pdf, y, title, reportId, [["Scenario", "Probability", "Yr 1 Subscribers", "Annual Revenue", "Break-Even"]], report.financials.scenarios.map((scenario) => [clean(scenario.scenario), clean(scenario.probability), clean(scenario.subscribersYr1), clean(scenario.annualRevenue), clean(scenario.breakEven)]), { firstColumnWidth: 82, fontSize: 7.8 });
  }

  y = section(pdf, y, "5. Risk Assessment", title, reportId);
  y = table(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Mitigation"]], report.risks.map((risk) => [clean(risk.name), clean(risk.probability), clean(risk.impact), clean(risk.level), clean(risk.mitigation)]), { firstColumnWidth: 120, fontSize: 7.4 });

  y = section(pdf, y, "6. Funding Mix", title, reportId);
  if (report.fundingMix?.length) {
    y = table(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((source) => [clean(source.source), clean(source.share), clean(source.amount), clean(source.rationale)]), { firstColumnWidth: 140, fontSize: 7.7 });
  }
  y = paragraph(pdf, y, report.fundingAdvisory, title, reportId);

  y = section(pdf, y, "7. Strategic Recommendations", title, reportId);
  y = numberedList(pdf, y, report.recommendations, title, reportId);

  y = section(pdf, y, "8. Next Steps", title, reportId);
  y = numberedList(pdf, y, report.nextSteps, title, reportId);

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
