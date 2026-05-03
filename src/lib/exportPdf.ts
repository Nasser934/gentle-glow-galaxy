import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

/* --------------------------------------------------------------------------
 * Native-text PDF exporter
 *
 * Produces a fully selectable / searchable / copy-pasteable PDF with a
 * proper cover page. Charts (recharts) are rasterized from the live preview
 * so the visuals match the website, but ALL text is rendered as native PDF
 * text — solving the "jumbled words" issue when third parties extract text.
 * ------------------------------------------------------------------------ */

const COLORS = {
  primary:       [31, 78, 216] as [number, number, number],   // #1f4ed8
  primaryDark:   [15, 23, 42] as [number, number, number],    // #0f172a
  text:          [15, 23, 42] as [number, number, number],
  muted:         [100, 116, 139] as [number, number, number], // #64748b
  border:        [203, 213, 225] as [number, number, number], // #cbd5e1
  surface:       [248, 250, 252] as [number, number, number], // #f8fafc
  success:       [22, 163, 74] as [number, number, number],   // #16a34a
  warning:       [245, 158, 11] as [number, number, number],  // #f59e0b
  destructive:   [220, 38, 38] as [number, number, number],   // #dc2626
  white:         [255, 255, 255] as [number, number, number],
  softBlue:      [239, 246, 255] as [number, number, number], // #eff6ff
};

const verdictColor = (v: string): [number, number, number] =>
  v === "PROCEED" ? COLORS.success
  : v === "PROCEED WITH CAUTION" ? COLORS.warning
  : v === "REVISE" ? [234, 88, 12]
  : COLORS.destructive;

const PAGE_W = 595.28; // A4 portrait pt
const PAGE_H = 841.89;
const M = 48;          // margin
const CONTENT_W = PAGE_W - M * 2;

interface PdfCtx {
  pdf: jsPDF;
  y: number;
  pageNum: number;
  totalPages: number; // best-effort; updated lazily
  projectName: string;
  reportId: string;
}

const setColor = (pdf: jsPDF, c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
const setFill  = (pdf: jsPDF, c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
const setDraw  = (pdf: jsPDF, c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > PAGE_H - 64) addPage(ctx);
}

function pageHeader(ctx: PdfCtx) {
  const { pdf } = ctx;
  setColor(pdf, COLORS.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("AI FEASIBILITY ENGINE · CONFIDENTIAL", M, 32);

  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`${ctx.projectName} · Page ${ctx.pageNum}`, PAGE_W - M, 32, { align: "right" });

  setDraw(pdf, COLORS.primary);
  pdf.setLineWidth(1.4);
  pdf.line(M, 40, PAGE_W - M, 40);
}

function pageFooter(ctx: PdfCtx) {
  const { pdf } = ctx;
  setDraw(pdf, COLORS.border);
  pdf.setLineWidth(0.5);
  pdf.line(M, PAGE_H - 48, PAGE_W - M, PAGE_H - 48);

  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text("Confidential · AI-Generated · Not financial advice", M, PAGE_H - 32);
  pdf.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    PAGE_W - M, PAGE_H - 32, { align: "right" }
  );
  pdf.text(`Report ${ctx.reportId}`, PAGE_W / 2, PAGE_H - 32, { align: "center" });
}

function addPage(ctx: PdfCtx) {
  ctx.pdf.addPage();
  ctx.pageNum += 1;
  ctx.y = 64;
  pageHeader(ctx);
  pageFooter(ctx);
}

function sectionTitle(ctx: PdfCtx, n: string, text: string) {
  ensureSpace(ctx, 28);
  const { pdf } = ctx;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  setColor(pdf, COLORS.primary);
  pdf.text(`${n}.`, M, ctx.y);
  setColor(pdf, COLORS.text);
  pdf.text(text.toUpperCase(), M + 18, ctx.y);
  ctx.y += 16;
}

function subTitle(ctx: PdfCtx, text: string) {
  ensureSpace(ctx, 22);
  const { pdf } = ctx;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  setColor(pdf, [51, 65, 85]);
  pdf.text(text.toUpperCase(), M, ctx.y);
  ctx.y += 12;
}

function paragraph(ctx: PdfCtx, text: string, opts: { size?: number; color?: [number, number, number]; gap?: number } = {}) {
  if (!text) return;
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  setColor(pdf, opts.color ?? COLORS.text);
  const lines = pdf.splitTextToSize(text, CONTENT_W) as string[];
  const lh = size * 1.4;
  for (const ln of lines) {
    ensureSpace(ctx, lh);
    pdf.text(ln, M, ctx.y);
    ctx.y += lh;
  }
  ctx.y += opts.gap ?? 4;
}

function bulletList(ctx: PdfCtx, items: string[], opts: { numbered?: boolean; size?: number } = {}) {
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  const lh = size * 1.45;
  items.forEach((it, idx) => {
    const marker = opts.numbered ? `${idx + 1}.` : "•";
    const indent = 14;
    const lines = pdf.splitTextToSize(it, CONTENT_W - indent) as string[];
    ensureSpace(ctx, lh * lines.length + 2);
    setColor(pdf, COLORS.primary);
    pdf.setFont("helvetica", "bold");
    pdf.text(marker, M, ctx.y);
    pdf.setFont("helvetica", "normal");
    setColor(pdf, COLORS.text);
    lines.forEach((ln, i) => {
      pdf.text(ln, M + indent, ctx.y + i * lh);
    });
    ctx.y += lh * lines.length + 2;
  });
  ctx.y += 2;
}

async function captureChart(selector: string, scope: HTMLElement): Promise<string | null> {
  const el = scope.querySelector<HTMLElement>(selector);
  if (!el) return null;
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("[exportPdf] chart capture failed", selector, e);
    return null;
  }
}

function fitImage(imgW: number, imgH: number, maxW: number, maxH: number) {
  const r = imgW / imgH;
  let w = maxW, h = maxW / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  return { w, h };
}

async function placeChart(ctx: PdfCtx, dataUrl: string | null, maxH = 220) {
  if (!dataUrl) return;
  const { pdf } = ctx;
  const props = pdf.getImageProperties(dataUrl);
  const { w, h } = fitImage(props.width, props.height, CONTENT_W, maxH);
  ensureSpace(ctx, h + 8);
  const x = M + (CONTENT_W - w) / 2;
  pdf.addImage(dataUrl, "PNG", x, ctx.y, w, h);
  ctx.y += h + 8;
}

/* --------------------------------------------------------------------------
 * Cover page
 * ------------------------------------------------------------------------ */

function drawCover(ctx: PdfCtx, report: FeasibilityReport, inputs: ConceptInputs) {
  const { pdf } = ctx;

  // Top accent band
  setFill(pdf, COLORS.primary);
  pdf.rect(0, 0, PAGE_W, 120, "F");

  setColor(pdf, COLORS.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("AI FEASIBILITY ENGINE", M, 50);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Confidential Strategic Analysis", M, 66);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(`Report ${report.reportId}`, PAGE_W - M, 50, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(report.dateIssued, PAGE_W - M, 66, { align: "right" });

  // Title block
  let y = 200;
  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("FEASIBILITY REPORT", M, y);
  y += 28;

  setColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  const titleLines = pdf.splitTextToSize(inputs.projectName || "Untitled Project", CONTENT_W) as string[];
  for (const ln of titleLines) { pdf.text(ln, M, y); y += 32; }

  if (inputs.location || inputs.industry) {
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    const sub = [inputs.industry, inputs.location].filter(Boolean).join(" · ");
    pdf.text(sub, M, y);
    y += 18;
  }

  // Verdict pill
  y += 16;
  const vColor = verdictColor(report.scores.verdict);
  const vText = report.scores.verdict;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  const vw = pdf.getTextWidth(vText) + 24;
  setFill(pdf, vColor);
  pdf.roundedRect(M, y, vw, 24, 4, 4, "F");
  setColor(pdf, COLORS.white);
  pdf.text(vText, M + 12, y + 16);

  // KPI grid
  y += 56;
  const kpis: Array<[string, string]> = [
    ["OVERALL SCORE", `${report.scores.overall.toFixed(1)} / 10`],
    ["INVESTMENT", report.financials.investmentRange],
    ["BREAK-EVEN", report.financials.breakEvenSummary],
    ["MARKET TAM", `${report.market.tamValue} (CAGR ${report.market.tamCagr})`],
  ];
  const colW = (CONTENT_W - 12) / 2;
  const rowH = 64;
  kpis.forEach((kpi, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + col * (colW + 12);
    const ky = y + row * (rowH + 12);
    setFill(pdf, COLORS.surface);
    setDraw(pdf, COLORS.border);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(x, ky, colW, rowH, 6, 6, "FD");
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(kpi[0], x + 14, ky + 18);
    setColor(pdf, COLORS.text);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    const lines = pdf.splitTextToSize(kpi[1], colW - 28) as string[];
    pdf.text(lines.slice(0, 2), x + 14, ky + 38);
  });
  y += rowH * 2 + 24;

  // Meta block
  setDraw(pdf, COLORS.border);
  pdf.line(M, y, PAGE_W - M, y);
  y += 18;

  const meta: Array<[string, string]> = [
    ["Report ID", report.reportId],
    ["Date Issued", report.dateIssued],
    ["Classification", report.classification],
    ["Prepared by", report.preparedBy],
    ["Methodology", report.methodology],
  ];
  pdf.setFontSize(9.5);
  meta.forEach(([k, v]) => {
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "bold");
    pdf.text(k, M, y);
    setColor(pdf, COLORS.text);
    pdf.setFont("helvetica", "normal");
    const vLines = pdf.splitTextToSize(v ?? "—", CONTENT_W - 110) as string[];
    pdf.text(vLines, M + 110, y);
    y += Math.max(14, vLines.length * 12);
  });

  // Footer band
  setFill(pdf, COLORS.primary);
  pdf.rect(0, PAGE_H - 56, PAGE_W, 56, "F");
  setColor(pdf, COLORS.white);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(
    "This document is auto-generated by AI analysis and does not constitute financial or legal advice.",
    M, PAGE_H - 32
  );
  pdf.setFont("helvetica", "bold");
  pdf.text("CONCEPT AI", PAGE_W - M, PAGE_H - 32, { align: "right" });
}

/* --------------------------------------------------------------------------
 * Main entrypoint
 * ------------------------------------------------------------------------ */

export async function exportReportToPdf(
  rootEl: HTMLElement,
  fileName: string,
  payload?: { report: FeasibilityReport; inputs: ConceptInputs }
) {
  await document.fonts?.ready;

  // Backwards-compat: extract report/inputs from window state if not passed.
  const data = payload ?? (window as any).__pdfPayload;
  if (!data?.report || !data?.inputs) {
    throw new Error("Missing report data for PDF export.");
  }
  const { report, inputs } = data as { report: FeasibilityReport; inputs: ConceptInputs };

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const ctx: PdfCtx = {
    pdf, y: 64, pageNum: 1, totalPages: 1,
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
  };

  // Cover (no header/footer chrome — full bleed)
  drawCover(ctx, report, inputs);

  // Capture charts from the live preview before rendering body pages.
  const radarImg = await captureChart(".recharts-wrapper", rootEl);
  // Try to grab additional charts via a broader scope:
  const allCharts = Array.from(rootEl.querySelectorAll<HTMLElement>(".recharts-wrapper"));
  const chartImgs: string[] = [];
  for (const el of allCharts) {
    try {
      const c = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      chartImgs.push(c.toDataURL("image/png"));
    } catch { /* ignore */ }
  }
  // Conventionally: [0]=dashboard radar, [1]=score distribution, [2]=report radar, [3]=market growth, [4]=capex
  const dashRadar = chartImgs[0] ?? radarImg;
  const dashBars  = chartImgs[1] ?? null;
  const repRadar  = chartImgs[2] ?? dashRadar;
  const marketImg = chartImgs[3] ?? null;
  const capexImg  = chartImgs[4] ?? null;

  /* ---------- PAGE 2 — Executive snapshot ---------- */
  addPage(ctx);
  sectionTitle(ctx, "1", "Executive Summary");
  paragraph(ctx, report.executiveSummary, { size: 9.5 });

  subTitle(ctx, "FMART Scoring Overview");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Dimension", "Score", "Key Finding"]],
    body: [
      ["Financial Feasibility",   `${report.scores.financial.toFixed(1)} / 10`,    report.scores.financialFinding],
      ["Market Attractiveness",   `${report.scores.market.toFixed(1)} / 10`,       report.scores.marketFinding],
      ["Technical Achievability", `${report.scores.achievability.toFixed(1)} / 10`, report.scores.achievabilityFinding],
      ["Operational Feasibility", `${report.scores.operational.toFixed(1)} / 10`,   report.scores.operationalFinding],
      ["Risk Level (inv.)",       `${report.scores.risk.toFixed(1)} / 10`,         report.scores.riskFinding],
      ["Market Timing",           `${report.scores.timing.toFixed(1)} / 10`,       report.scores.timingFinding],
    ],
    foot: [[
      { content: "OVERALL WEIGHTED SCORE", styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
      { content: `${report.scores.overall.toFixed(1)} / 10`, styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
      { content: `RECOMMENDED — ${report.scores.verdict}`, styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
    ]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 14;

  subTitle(ctx, "FMART 5-Dimension Score Radar");
  await placeChart(ctx, repRadar, 240);

  /* ---------- PAGE — Market ---------- */
  addPage(ctx);
  sectionTitle(ctx, "2", "Market Analysis");
  subTitle(ctx, "2.1 Market Sizing (TAM · SAM · SOM)");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Tier", "Label", "Value", "CAGR"]],
    body: [
      ["TAM", report.market.tamLabel, report.market.tamValue, report.market.tamCagr],
      ["SAM", report.market.samLabel, report.market.samValue, report.market.samCagr],
      ["SOM", report.market.somLabel, report.market.somValue, report.market.somCagr],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 12;

  if (marketImg) {
    subTitle(ctx, "Figure — Market Growth Projection");
    await placeChart(ctx, marketImg, 200);
  }

  subTitle(ctx, "2.2 Customer Profile");
  const cust = report.customer;
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    body: [
      ["Age & Location",       cust.ageLocation],
      ["Income",               cust.income],
      ["Goals",                cust.goals],
      ["Willingness to Pay",   cust.willingnessToPay],
      ["Behavior",             cust.behavior],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: COLORS.surface } },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 12;

  if (report.competitors?.length) {
    subTitle(ctx, "2.3 Competitive Landscape");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Competitor", "Model", "Weakness", "Our Edge"]],
      body: report.competitors.map(c => [c.name, c.model, c.weakness, c.edge]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 12;
  }

  /* ---------- PAGE — Financials ---------- */
  addPage(ctx);
  sectionTitle(ctx, "3", "Financial Analysis");
  subTitle(ctx, `3.1 Capital Expenditure (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Category", "Low", "High", "Notes"]],
    body: report.financials.capEx.map(c => [c.category, c.low.toLocaleString(), c.high.toLocaleString(), c.notes]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 12;

  if (capexImg) {
    await placeChart(ctx, capexImg, 200);
  }

  subTitle(ctx, `3.2 Operating Expenses (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Category", "Monthly", "Annual"]],
    body: report.financials.opEx.map(c => [c.category, c.monthly.toLocaleString(), c.annual.toLocaleString()]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 12;

  subTitle(ctx, "3.3 Revenue Scenarios");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Scenario", "Probability", "Yr 1 Subscribers", "Annual Revenue", "Break-Even"]],
    body: report.financials.scenarios.map(s => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 12;

  /* ---------- PAGE — Risks ---------- */
  addPage(ctx);
  sectionTitle(ctx, "4", "Risk Assessment");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Risk", "Probability", "Impact", "Level", "Mitigation"]],
    body: report.risks.map(r => [r.name, r.probability, r.impact, r.level, r.mitigation]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 16;

  /* ---------- PAGE — Funding ---------- */
  if (report.fundingMix?.length) {
    sectionTitle(ctx, "5", "Funding Mix");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Source", "Share", "Amount", "Rationale"]],
      body: report.fundingMix.map(f => [f.source, f.share, f.amount, f.rationale]),
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 10;
    if (report.fundingAdvisory) paragraph(ctx, report.fundingAdvisory, { size: 9 });
  }

  /* ---------- PAGE — Recommendations & Next Steps ---------- */
  addPage(ctx);
  sectionTitle(ctx, "6", "Strategic Recommendations");
  bulletList(ctx, report.recommendations || [], { numbered: true });

  if (report.nextSteps?.length) {
    sectionTitle(ctx, "7", "Next Steps");
    bulletList(ctx, report.nextSteps, { numbered: true });
  }

  // Optional: dashboard charts on a final summary page
  if (dashRadar || dashBars) {
    addPage(ctx);
    sectionTitle(ctx, "8", "Live Dashboard Snapshot");
    if (dashRadar) { subTitle(ctx, "FMART Radar"); await placeChart(ctx, dashRadar, 230); }
    if (dashBars)  { subTitle(ctx, "Score Distribution"); await placeChart(ctx, dashBars, 200); }
  }

  // Save
  const blob = pdf.output("blob");
  if (!blob || blob.size < 1000) throw new Error("PDF file was not generated correctly.");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);

  return { fileName: link.download, bytes: blob.size, pages: ctx.pageNum };
}
