import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas-pro";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { formatConfidence, isInternalProject } from "@/lib/format";
import {
  ensureEvidenceFields,
  sanitizeForConsumer,
  assessInputQuality,
  deriveAssumptionRegister,
  type AssumptionRow,
} from "@/lib/evidence";

/* --------------------------------------------------------------------------
 * Native-text PDF exporter
 * ------------------------------------------------------------------------ */

const COLORS = {
  primary:     [31, 78, 216] as [number, number, number],
  primaryDark: [15, 23, 42] as [number, number, number],
  text:        [15, 23, 42] as [number, number, number],
  muted:       [100, 116, 139] as [number, number, number],
  border:      [203, 213, 225] as [number, number, number],
  surface:     [248, 250, 252] as [number, number, number],
  success:     [22, 163, 74] as [number, number, number],
  warning:     [245, 158, 11] as [number, number, number],
  destructive: [220, 38, 38] as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  softBlue:    [239, 246, 255] as [number, number, number],
  userInput:   [34, 139, 230] as [number, number, number],
  webResearch: [22, 163, 74] as [number, number, number],
  aiAssump:    [245, 158, 11] as [number, number, number],
};

const verdictColor = (v: string): [number, number, number] => {
  const u = (v || "").toUpperCase();
  if (u === "PROCEED") return COLORS.success;
  if (u.startsWith("CONDITIONAL") || u === "PROCEED WITH CAUTION" || u === "IMPROVE INPUTS BEFORE INVESTMENT DECISION")
    return COLORS.warning;
  if (u === "REVISE") return [234, 88, 12];
  return COLORS.destructive;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;

interface PdfCtx {
  pdf: jsPDF;
  y: number;
  pageNum: number;
  sectionNum: number;
  projectName: string;
  reportId: string;
}

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));
const setColor = (pdf: jsPDF, c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
const setFill  = (pdf: jsPDF, c: [number, number, number]) => pdf.setFillColor(c[0], c[1], c[2]);
const setDraw  = (pdf: jsPDF, c: [number, number, number]) => pdf.setDrawColor(c[0], c[1], c[2]);

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > PAGE_H - 60) addPage(ctx);
}

function pageHeader(ctx: PdfCtx) {
  const { pdf } = ctx;
  setColor(pdf, COLORS.primary);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("AI FEASIBILITY ENGINE · CONFIDENTIAL", M, 32);
  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.text(s(ctx.projectName), PAGE_W - M, 32, { align: "right" });
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
  pdf.text(`Report ${ctx.reportId} · Page ${ctx.pageNum}`, PAGE_W / 2, PAGE_H - 32, { align: "center" });
}

function addPage(ctx: PdfCtx) {
  ctx.pdf.addPage();
  ctx.pageNum += 1;
  ctx.y = 64;
  pageHeader(ctx);
  pageFooter(ctx);
}

function sectionTitle(ctx: PdfCtx, text: string) {
  ensureSpace(ctx, 26);
  if (ctx.y > 80) ctx.y += 4;
  const { pdf } = ctx;
  const n = ctx.sectionNum++;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  setColor(pdf, COLORS.primary);
  pdf.text(`${n}.`, M, ctx.y);
  setColor(pdf, COLORS.text);
  pdf.text(s(text).toUpperCase(), M + 18, ctx.y);
  ctx.y += 14;
}

function subTitle(ctx: PdfCtx, text: string) {
  ensureSpace(ctx, 18);
  ctx.y += 2;
  const { pdf } = ctx;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  setColor(pdf, [51, 65, 85]);
  pdf.text(s(text).toUpperCase(), M, ctx.y);
  ctx.y += 11;
}

function paragraph(
  ctx: PdfCtx, text: string,
  opts: { size?: number; color?: [number, number, number]; gap?: number; italic?: boolean } = {},
) {
  const safe = s(text);
  if (!safe) return;
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", opts.italic ? "italic" : "normal");
  pdf.setFontSize(size);
  setColor(pdf, opts.color ?? COLORS.text);
  const lines = pdf.splitTextToSize(safe, CONTENT_W) as string[];
  const lh = size * 1.35;
  for (const ln of lines) {
    ensureSpace(ctx, lh);
    pdf.text(ln, M, ctx.y);
    ctx.y += lh;
  }
  ctx.y += opts.gap ?? 3;
}

function bulletList(ctx: PdfCtx, items: string[], opts: { numbered?: boolean; size?: number } = {}) {
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  const lh = size * 1.45;
  (items || []).forEach((it, idx) => {
    const text = s(it);
    if (!text) return;
    const marker = opts.numbered ? `${idx + 1}.` : "•";
    const indent = 14;
    const lines = pdf.splitTextToSize(text, CONTENT_W - indent) as string[];
    ensureSpace(ctx, lh * lines.length + 2);
    setColor(pdf, COLORS.primary);
    pdf.setFont("helvetica", "bold");
    pdf.text(marker, M, ctx.y);
    pdf.setFont("helvetica", "normal");
    setColor(pdf, COLORS.text);
    lines.forEach((ln, i) => pdf.text(ln, M + indent, ctx.y + i * lh));
    ctx.y += lh * lines.length + 2;
  });
  ctx.y += 2;
}

function kv(ctx: PdfCtx, label: string, value: string | undefined) {
  const safe = s(value);
  if (!safe) return;
  const { pdf } = ctx;
  pdf.setFontSize(9);
  const valLines = pdf.splitTextToSize(safe, CONTENT_W - 130) as string[];
  ensureSpace(ctx, valLines.length * 12 + 2);
  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "bold");
  pdf.text(label, M, ctx.y);
  setColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "normal");
  pdf.text(valLines, M + 130, ctx.y);
  ctx.y += Math.max(12, valLines.length * 12) + 2;
}

function notice(ctx: PdfCtx, text: string, tone: "info" | "warn" = "info") {
  const safe = s(text);
  if (!safe) return;
  const { pdf } = ctx;
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8.5);
  const lines = pdf.splitTextToSize(safe, CONTENT_W - 16) as string[];
  const h = lines.length * 11 + 10;
  ensureSpace(ctx, h + 6);
  setFill(pdf, tone === "warn" ? [255, 247, 237] : COLORS.softBlue);
  setDraw(pdf, tone === "warn" ? COLORS.warning : COLORS.primary);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(M, ctx.y, CONTENT_W, h, 4, 4, "FD");
  setColor(pdf, tone === "warn" ? [124, 45, 18] : COLORS.primaryDark);
  lines.forEach((ln, i) => pdf.text(ln, M + 8, ctx.y + 13 + i * 11));
  ctx.y += h + 6;
}

/* --------------------------------------------------------------------------
 * Charts
 * ------------------------------------------------------------------------ */

async function captureCharts(rootEl: HTMLElement) {
  const els = Array.from(rootEl.querySelectorAll<HTMLElement>(".recharts-wrapper"));
  const out: string[] = [];
  for (const el of els) {
    try {
      const c = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      out.push(c.toDataURL("image/png"));
    } catch { /* skip */ }
  }
  return out;
}

function fitImage(imgW: number, imgH: number, maxW: number, maxH: number) {
  const r = imgW / imgH;
  let w = maxW, h = maxW / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  return { w, h };
}

async function placeChart(ctx: PdfCtx, dataUrl: string | null | undefined, maxH = 220) {
  if (!dataUrl) return;
  const { pdf } = ctx;
  const props = pdf.getImageProperties(dataUrl);
  const { w, h } = fitImage(props.width, props.height, CONTENT_W, maxH);
  ensureSpace(ctx, h + 8);
  const x = M + (CONTENT_W - w) / 2;
  pdf.addImage(dataUrl, "PNG", x, ctx.y, w, h);
  ctx.y += h + 8;
}

/** Native segmented bar (no html2canvas). */
function evidenceMixBar(
  ctx: PdfCtx,
  mix: { userInputPercent: number; webResearchPercent: number; aiAssumptionPercent: number },
  width = CONTENT_W,
) {
  const { pdf } = ctx;
  const h = 14;
  ensureSpace(ctx, h + 24);
  const x0 = M;
  const u = Math.max(0, mix.userInputPercent);
  const w = Math.max(0, mix.webResearchPercent);
  const a = Math.max(0, mix.aiAssumptionPercent);
  const total = u + w + a || 1;
  const uw = (u / total) * width;
  const ww = (w / total) * width;
  const aw = width - uw - ww;
  setFill(pdf, COLORS.userInput);   pdf.rect(x0, ctx.y, uw, h, "F");
  setFill(pdf, COLORS.webResearch); pdf.rect(x0 + uw, ctx.y, ww, h, "F");
  setFill(pdf, COLORS.aiAssump);    pdf.rect(x0 + uw + ww, ctx.y, aw, h, "F");
  ctx.y += h + 4;
  // legend
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  const items: Array<[string, [number, number, number]]> = [
    [`User input ${u}%`, COLORS.userInput],
    [`Web research ${w}%`, COLORS.webResearch],
    [`AI assumption ${a}%`, COLORS.aiAssump],
  ];
  let lx = x0;
  items.forEach(([label, c]) => {
    setFill(pdf, c); pdf.rect(lx, ctx.y - 7, 8, 8, "F");
    setColor(pdf, COLORS.text);
    pdf.text(label, lx + 12, ctx.y);
    lx += pdf.getTextWidth(label) + 28;
  });
  ctx.y += 14;
}

/* --------------------------------------------------------------------------
 * Cover
 * ------------------------------------------------------------------------ */

function drawCover(ctx: PdfCtx, report: FeasibilityReport, inputs: ConceptInputs) {
  const { pdf } = ctx;
  const decision = report.decision;
  const mix = report.evidenceMix;
  const confidencePct = decision?.overallConfidencePct ?? 0;
  const verdictText = decision?.verdict || report.scores.verdict;

  // Top band
  setFill(pdf, COLORS.primary);
  pdf.rect(0, 0, PAGE_W, 110, "F");
  setColor(pdf, COLORS.white);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("AI FEASIBILITY ENGINE", M, 50);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text("Confidential Strategic Analysis", M, 66);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  pdf.text(`Report ${report.reportId}`, PAGE_W - M, 50, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(s(report.dateIssued), PAGE_W - M, 66, { align: "right" });

  // Title
  let y = 150;
  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("FEASIBILITY REPORT", M, y);
  y += 24;
  setColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(26);
  const titleLines = pdf.splitTextToSize(s(inputs.projectName) || "Untitled Project", CONTENT_W) as string[];
  titleLines.slice(0, 2).forEach((ln) => { pdf.text(ln, M, y); y += 30; });

  if (inputs.location || inputs.industry) {
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
    pdf.text(s([inputs.industry, inputs.location].filter(Boolean).join(" · ")), M, y);
    y += 16;
  }

  // Verdict pill
  y += 10;
  const vColor = verdictColor(verdictText);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
  const vw = pdf.getTextWidth(verdictText) + 24;
  setFill(pdf, vColor);
  pdf.roundedRect(M, y, vw, 22, 4, 4, "F");
  setColor(pdf, COLORS.white);
  pdf.text(verdictText, M + 12, y + 15);

  // Recommendation label / next step
  if (decision?.recommendationLabel) {
    setColor(pdf, COLORS.text);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(s(decision.recommendationLabel), M + vw + 12, y + 15);
  }
  y += 32;

  if (decision?.nextStepHint) {
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(9.5);
    const ns = pdf.splitTextToSize(`Next step: ${s(decision.nextStepHint)}`, CONTENT_W) as string[];
    ns.forEach((ln) => { pdf.text(ln, M, y); y += 12; });
    y += 2;
  }

  // Blockers
  if (decision?.blockers?.length) {
    setColor(pdf, [124, 45, 18]);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.text("BLOCKERS", M, y);
    y += 11;
    pdf.setFont("helvetica", "normal"); setColor(pdf, COLORS.text);
    decision.blockers.slice(0, 4).forEach((b) => {
      const lines = pdf.splitTextToSize(`• ${s(b)}`, CONTENT_W) as string[];
      lines.forEach((ln) => { pdf.text(ln, M, y); y += 12; });
    });
    y += 4;
  }

  // KPI grid — 5 cells in 2 rows (3 + 2)
  const kpis: Array<[string, string]> = [
    ["OVERALL SCORE", `${(report.scores.overall ?? 0).toFixed(1)} / 10`],
    ["CONFIDENCE", confidencePct ? `${confidencePct}%` : "—"],
    ["AI ASSUMPTIONS", mix ? `${mix.aiAssumptionPercent}%` : "—"],
    ["USER INPUT", mix ? `${mix.userInputPercent}%` : "—"],
    ["WEB RESEARCH", mix ? `${mix.webResearchPercent}%` : "—"],
  ];
  const cols = 3;
  const gap = 10;
  const colW = (CONTENT_W - gap * (cols - 1)) / cols;
  const rowH = 52;
  kpis.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * (colW + gap);
    const ky = y + row * (rowH + gap);
    setFill(pdf, COLORS.surface);
    setDraw(pdf, COLORS.border);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(x, ky, colW, rowH, 6, 6, "FD");
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
    pdf.text(k[0], x + 10, ky + 16);
    setColor(pdf, COLORS.text);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
    pdf.text(k[1], x + 10, ky + 36);
  });
  y += rowH * 2 + gap + 10;

  // Data Provenance Snapshot
  setColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("DATA PROVENANCE SNAPSHOT", M, y);
  y += 10;
  if (mix) {
    // bar
    const h = 12;
    const u = mix.userInputPercent, w = mix.webResearchPercent, a = mix.aiAssumptionPercent;
    const total = u + w + a || 1;
    const uw = (u / total) * CONTENT_W;
    const ww = (w / total) * CONTENT_W;
    const aw = CONTENT_W - uw - ww;
    setFill(pdf, COLORS.userInput);   pdf.rect(M, y, uw, h, "F");
    setFill(pdf, COLORS.webResearch); pdf.rect(M + uw, y, ww, h, "F");
    setFill(pdf, COLORS.aiAssump);    pdf.rect(M + uw + ww, y, aw, h, "F");
    y += h + 14;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); setColor(pdf, COLORS.text);
    let lx = M;
    ([
      [`User input ${u}%`, COLORS.userInput],
      [`Web research ${w}%`, COLORS.webResearch],
      [`AI assumption ${a}%`, COLORS.aiAssump],
    ] as Array<[string, [number, number, number]]>).forEach(([label, c]) => {
      setFill(pdf, c); pdf.rect(lx, y - 7, 8, 8, "F");
      setColor(pdf, COLORS.text);
      pdf.text(label, lx + 12, y);
      lx += pdf.getTextWidth(label) + 24;
    });
    y += 12;
  }
  setColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8.5);
  const provNote = pdf.splitTextToSize(
    "This report combines user-provided project details, public market research, and AI-generated assumptions. Higher user input and stronger source evidence increase analysis confidence.",
    CONTENT_W,
  ) as string[];
  provNote.forEach((ln) => { pdf.text(ln, M, y); y += 10; });
  y += 2;

  if (mix && mix.aiAssumptionPercent > 40) {
    setFill(pdf, [255, 247, 237]); setDraw(pdf, COLORS.warning);
    pdf.setLineWidth(0.6);
    const warnLines = pdf.splitTextToSize(
      "High assumption dependency — validate key assumptions before investment or launch decisions.",
      CONTENT_W - 14,
    ) as string[];
    const wh = warnLines.length * 11 + 10;
    pdf.roundedRect(M, y, CONTENT_W, wh, 4, 4, "FD");
    setColor(pdf, [124, 45, 18]);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
    warnLines.forEach((ln, i) => pdf.text(ln, M + 8, y + 13 + i * 11));
    y += wh + 6;
  }

  if (report.legacyEvidence) {
    setColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(8);
    pdf.text("Estimated evidence mix based on available report data.", M, y);
    y += 10;
  }

  // Footer band
  setFill(pdf, COLORS.primary);
  pdf.rect(0, PAGE_H - 48, PAGE_W, 48, "F");
  setColor(pdf, COLORS.white);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
  pdf.text("Auto-generated by AI. Not financial or legal advice.", M, PAGE_H - 22);
  pdf.setFont("helvetica", "bold");
  pdf.text("CONCEPT AI", PAGE_W - M, PAGE_H - 22, { align: "right" });
}

/* --------------------------------------------------------------------------
 * Main entrypoint
 * ------------------------------------------------------------------------ */

export interface VersionFamilyEntry {
  id: string;
  slug?: string | null;
  title?: string | null;
  created_at: string;
  isCurrent?: boolean;
}

export async function exportReportToPdf(
  rootEl: HTMLElement,
  fileName: string,
  payload?: {
    report: FeasibilityReport;
    inputs: ConceptInputs;
    versionFamily?: VersionFamilyEntry[];
  },
) {
  await document.fonts?.ready;
  const data = payload ?? (window as any).__pdfPayload;
  if (!data?.report || !data?.inputs) throw new Error("Missing report data for PDF export.");
  const { report: rawReport, inputs, versionFamily } = data as {
    report: FeasibilityReport; inputs: ConceptInputs; versionFamily?: VersionFamilyEntry[];
  };

  // Enrich — does not override existing backend decision/evidence per ensureEvidenceFields.
  const report = ensureEvidenceFields(rawReport, inputs);
  const decision = report.decision;
  const mix = report.evidenceMix;
  const iq = assessInputQuality(inputs);

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const ctx: PdfCtx = {
    pdf, y: 64, pageNum: 1, sectionNum: 1,
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
  };

  drawCover(ctx, report, inputs);

  // Capture charts
  const chartImgs = await captureCharts(rootEl);
  const dashRadar = chartImgs[0];
  const dashBars  = chartImgs[1];
  const repRadar  = chartImgs[2] ?? dashRadar;
  const marketImg = chartImgs[3];
  const capexImg  = chartImgs[4];

  /* ---------- Body ---------- */
  addPage(ctx);

  // 1. Project Brief
  sectionTitle(ctx, "Project Brief");
  kv(ctx, "Project", inputs.projectName);
  kv(ctx, "Industry", inputs.industry);
  kv(ctx, "Location", inputs.location);
  kv(ctx, "Business Model", inputs.businessModel);
  kv(ctx, "Revenue Model", inputs.revenueModel);
  kv(ctx, "Budget Range", inputs.budgetRange);
  kv(ctx, "Timeline", inputs.timeline);
  kv(ctx, "Team Size", inputs.teamSize);
  kv(ctx, "Tech Readiness", inputs.technologyReadiness);
  kv(ctx, "Founder Experience", inputs.founderExperience);
  if (inputs.description)              { subTitle(ctx, "Concept Description");      paragraph(ctx, inputs.description,         { size: 9 }); }
  if (inputs.strategicObjectives)      { subTitle(ctx, "Strategic Objectives");     paragraph(ctx, inputs.strategicObjectives, { size: 9 }); }
  if (inputs.assumptions)              { subTitle(ctx, "Assumptions");              paragraph(ctx, inputs.assumptions,         { size: 9 }); }
  if (inputs.constraints)              { subTitle(ctx, "Constraints");              paragraph(ctx, inputs.constraints,         { size: 9 }); }
  if (inputs.successFactors)           { subTitle(ctx, "Success Factors");          paragraph(ctx, inputs.successFactors,      { size: 9 }); }
  if (inputs.knownRisks)               { subTitle(ctx, "Known Risks (Input)");      paragraph(ctx, inputs.knownRisks,          { size: 9 }); }
  if (inputs.regulatoryConsiderations) { subTitle(ctx, "Regulatory Considerations"); paragraph(ctx, inputs.regulatoryConsiderations, { size: 9 }); }
  if (inputs.dependencies)             { subTitle(ctx, "Dependencies");             paragraph(ctx, inputs.dependencies,        { size: 9 }); }

  // 2. Executive Summary
  sectionTitle(ctx, "Executive Summary");
  paragraph(ctx, report.executiveSummary, { size: 9.5 });

  if (decision) {
    notice(
      ctx,
      `Recommendation: ${s(decision.recommendationLabel || decision.verdict)}. ` +
      (decision.nextStepHint ? `Next step — ${s(decision.nextStepHint)}` : ""),
      "info",
    );
  }

  subTitle(ctx, "FMART Scoring Overview");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Dimension", "Score", "Key Finding"]],
    body: [
      ["Financial Feasibility",   `${report.scores.financial.toFixed(1)} / 10`,    s(report.scores.financialFinding)],
      ["Market Attractiveness",   `${report.scores.market.toFixed(1)} / 10`,       s(report.scores.marketFinding)],
      ["Technical Achievability", `${report.scores.achievability.toFixed(1)} / 10`, s(report.scores.achievabilityFinding)],
      ["Operational Feasibility", `${report.scores.operational.toFixed(1)} / 10`,   s(report.scores.operationalFinding)],
      ["Risk Level (inverse)",    `${report.scores.risk.toFixed(1)} / 10`,         s(report.scores.riskFinding)],
      ["Market Timing",           `${report.scores.timing.toFixed(1)} / 10`,       s(report.scores.timingFinding)],
    ],
    foot: [[
      { content: "OVERALL WEIGHTED SCORE", styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
      { content: `${report.scores.overall.toFixed(1)} / 10`, styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
      { content: s(`RECOMMENDED — ${decision?.verdict ?? report.scores.verdict}`), styles: { fillColor: COLORS.softBlue, textColor: COLORS.primary, fontStyle: "bold" } },
    ]],
    columnStyles: { 2: { cellWidth: CONTENT_W - 220 } },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 8;

  if (report.scores.weights || report.scores.confidence) {
    subTitle(ctx, "Scoring Methodology — Weights & Confidence");
    const w = report.scores.weights as any;
    const c = report.scores.confidence as any;
    const rat = report.scores.rationale as any;
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Dimension", "Weight", "Confidence", "Rationale"]],
      body: ["financial","market","achievability","risk","timing","operational"].map((k) => [
        k.charAt(0).toUpperCase() + k.slice(1),
        w ? `${Math.round((w[k] ?? 0) * 100)}%` : "—",
        c ? formatConfidence(c[k]) : "—",
        s(rat ? (rat[k] ?? "—") : "—"),
      ]),
      columnStyles: { 3: { cellWidth: CONTENT_W - 230 } },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 8;
  }

  subTitle(ctx, "FMART 6-Dimension Weighted Scoring");
  await placeChart(ctx, repRadar, 220);

  // 3. Why this score?
  if (report.scoreExplanation?.length) {
    sectionTitle(ctx, "Why this score?");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Dimension", "Score", "What helped", "What lowered", "Action", "Implication"]],
      body: report.scoreExplanation.map((r) => [
        s(r.label),
        `${(r.score ?? 0).toFixed(1)}`,
        s((r.positiveDrivers || []).join(" ")),
        s([...(r.negativeDrivers || []), ...(r.missingEvidence || [])].join(" ")),
        s((r.improvementActions || []).join(" ")),
        s(r.decisionImplication),
      ]),
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 36, halign: "center" },
      },
      styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // 4. Input Quality
  sectionTitle(ctx, "Input Quality");
  const iqScore = report.inputQualityScore ?? iq.overall;
  const iqLabel =
    iqScore >= 80 ? "Strong"
    : iqScore >= 60 ? "Adequate"
    : iqScore >= 40 ? "Needs improvement"
    : "Weak";
  paragraph(ctx, `Input quality score: ${iqScore} / 100 — ${iqLabel}.`, { size: 10 });
  notice(ctx, "Stronger inputs improve confidence. They do not automatically increase the feasibility score.", "info");

  const missing = report.inputCompleteness?.missingFields ?? iq.missing;
  const weak    = report.inputCompleteness?.weakFields ?? [...iq.weak, ...iq.needsImprovement];
  const contra  = report.inputCompleteness?.contradictoryFields ?? iq.contradictions;
  if (missing?.length) { subTitle(ctx, "Missing fields"); bulletList(ctx, missing, { size: 9 }); }
  if (weak?.length)    { subTitle(ctx, "Weak / needs improvement"); bulletList(ctx, weak, { size: 9 }); }
  if (contra?.length)  { subTitle(ctx, "Possible contradictions"); bulletList(ctx, contra, { size: 9 }); }

  const fieldSuggestions = iq.fields.filter((f) => f.status !== "complete").slice(0, 8);
  if (fieldSuggestions.length) {
    subTitle(ctx, "Top field-level suggestions");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Field", "Status", "Why it matters", "What to add"]],
      body: fieldSuggestions.map((f) => [s(f.label), s(f.status.replace("_", " ")), s(f.impact), s(f.suggestion)]),
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 70 } },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // 5. Evidence Mix
  if (mix) {
    sectionTitle(ctx, "Evidence Mix");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Source", "Share"]],
      body: [
        ["User input",     `${mix.userInputPercent}%`],
        ["Web research",   `${mix.webResearchPercent}%`],
        ["AI assumption",  `${mix.aiAssumptionPercent}%`],
      ],
      columnStyles: { 0: { cellWidth: 200, fontStyle: "bold" }, 1: { cellWidth: 70, halign: "right" } },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 10;
    evidenceMixBar(ctx, mix);
    if (mix.aiAssumptionPercent > 40) {
      notice(
        ctx,
        "Some parts of this report rely on assumptions because input detail or public evidence is incomplete. Add more project details and validation evidence to improve confidence.",
        "warn",
      );
    }
  }

  // 6. Evidence behind this report (claim map)
  if (report.claimEvidenceMap?.length) {
    sectionTitle(ctx, "Evidence behind this report");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Claim", "Section", "User", "Web", "AI", "Confidence", "How to strengthen"]],
      body: report.claimEvidenceMap.map((c) => [
        s(c.claimText),
        s(c.reportSection),
        `${c.userInputPercent}%`,
        `${c.webResearchPercent}%`,
        `${c.aiAssumptionPercent}%`,
        s(c.confidence),
        s(c.userCanImproveBy),
      ]),
      columnStyles: {
        0: { cellWidth: 150 },
        1: { cellWidth: 70 },
        2: { cellWidth: 32, halign: "center" },
        3: { cellWidth: 32, halign: "center" },
        4: { cellWidth: 32, halign: "center" },
        5: { cellWidth: 50, halign: "center" },
      },
      styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 8;
  }

  // 7. Market
  sectionTitle(ctx, "Market Analysis");
  subTitle(ctx, "Market Sizing (TAM · SAM · SOM)");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Tier", "Label", "Value", "CAGR"]],
    body: [
      ["TAM", s(report.market.tamLabel), s(report.market.tamValue), s(report.market.tamCagr)],
      ["SAM", s(report.market.samLabel), s(report.market.samValue), s(report.market.samCagr)],
      ["SOM", s(report.market.somLabel), s(report.market.somValue), s(report.market.somCagr)],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 6;

  if (marketImg) { subTitle(ctx, "Market Growth Projection"); await placeChart(ctx, marketImg, 180); }

  subTitle(ctx, "Customer Profile");
  const cust = report.customer;
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    body: [
      ["Age & Location",      s(cust.ageLocation)],
      ["Income",              s(cust.income)],
      ["Goals",               s(cust.goals)],
      ["Willingness to Pay",  s(cust.willingnessToPay)],
      ["Behavior",            s(cust.behavior)],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: COLORS.surface } },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 6;

  if (report.competitors?.length) {
    subTitle(ctx, "Competitive Landscape");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Competitor", "Model", "Weakness", "Competitor Strength / Gap"]],
      body: report.competitors.map((c) => [s(c.name), s(c.model), s(c.weakness), s(c.edge)]),
      columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } },
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 6;
  }

  if (report.research) {
    const r = report.research;
    subTitle(ctx, "Market Research & Signals");
    paragraph(ctx, r.overview, { size: 9 });
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      body: [["Confidence", s(r.confidence)], ["Sentiment", s(r.sentiment)]],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: COLORS.surface } },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 6;
    if (r.keySignals?.length)         { subTitle(ctx, "Key Signals");         bulletList(ctx, r.keySignals,        { size: 9 }); }
    if (r.painPoints?.length)         { subTitle(ctx, "Pain Points");         bulletList(ctx, r.painPoints,        { size: 9 }); }
    if (r.competitorMentions?.length) { subTitle(ctx, "Competitor Mentions"); bulletList(ctx, r.competitorMentions, { size: 9 }); }
    if (r.redditSignals?.length)      { subTitle(ctx, "Reddit Signals");      bulletList(ctx, r.redditSignals,     { size: 9 }); }
    if (r.webSignals?.length)         { subTitle(ctx, "Web Signals");         bulletList(ctx, r.webSignals,        { size: 9 }); }
    if (r.citations?.length) {
      subTitle(ctx, "Citations");
      autoTable(pdf, {
        startY: ctx.y,
        margin: { left: M, right: M },
        head: [["Source", "Title", "Takeaway"]],
        body: r.citations.map((c) => [s(c.source), s(c.title), s(c.takeaway)]),
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 160 } },
        styles: { font: "helvetica", fontSize: 7.8, cellPadding: 3.5, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: COLORS.surface },
        didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
      });
      ctx.y = (pdf as any).lastAutoTable.finalY + 6;
    }
  }

  // 8. Financials
  sectionTitle(ctx, "Financial Analysis");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    body: [
      ["Investment Range", s(report.financials.investmentRange)],
      ["Break-Even",       s(report.financials.breakEvenSummary)],
      ...(report.financials.ltvCacRatio ? [["LTV : CAC", s(report.financials.ltvCacRatio)]] : []),
      ["CapEx (Mid)", s(`${report.financials.currency} ${report.financials.capExTotal.mid.toLocaleString()}  (range ${report.financials.capExTotal.low.toLocaleString()}–${report.financials.capExTotal.high.toLocaleString()})`)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130, fillColor: COLORS.surface } },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 8;

  subTitle(ctx, `Capital Expenditure (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Category", "Low", "High", "Notes"]],
    body: report.financials.capEx.map((c) => [s(c.category), c.low.toLocaleString(), c.high.toLocaleString(), s(c.notes)]),
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60, halign: "right" }, 2: { cellWidth: 60, halign: "right" } },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 6;

  if (capexImg) await placeChart(ctx, capexImg, 180);

  subTitle(ctx, `Operating Expenses (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Category", "Monthly", "Annual"]],
    body: report.financials.opEx.map((c) => [s(c.category), c.monthly.toLocaleString(), c.annual.toLocaleString()]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 6;

  subTitle(ctx, "Revenue Scenarios");
  const internal = isInternalProject(report);
  const custLabel = internal ? "Internal Users" : "Yr 1 Customers";
  const revLabel  = internal ? "Annual Savings / Value Realized" : "Annual Revenue";
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Scenario", "Probability", custLabel, revLabel, "Break-Even"]],
    body: report.financials.scenarios.map((sc) => [s(sc.scenario), s(sc.probability), s(sc.subscribersYr1), s(sc.annualRevenue), s(sc.breakEven)]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 8;

  // 9. Risks
  sectionTitle(ctx, "Risk Assessment");
  autoTable(pdf, {
    startY: ctx.y,
    margin: { left: M, right: M },
    head: [["Risk", "Probability", "Impact", "Level", "Mitigation"]],
    body: report.risks.map((r) => [s(r.name), s(r.probability), s(r.impact), s(r.level), s(r.mitigation)]),
    columnStyles: {
      0: { cellWidth: 110 }, 1: { cellWidth: 56, halign: "center" },
      2: { cellWidth: 50, halign: "center" }, 3: { cellWidth: 50, halign: "center" },
    },
    styles: { font: "helvetica", fontSize: 8.2, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLORS.surface },
    didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
  });
  ctx.y = (pdf as any).lastAutoTable.finalY + 8;

  // 10. Funding
  if (report.fundingMix?.length) {
    sectionTitle(ctx, "Funding Mix");
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Source", "Share", "Amount", "Rationale"]],
      body: report.fundingMix.map((f) => [s(f.source), s(f.share), s(f.amount), s(f.rationale)]),
      columnStyles: { 3: { cellWidth: CONTENT_W - 240 } },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 6;
    if (report.fundingAdvisory) paragraph(ctx, report.fundingAdvisory, { size: 9 });
  }

  // 11. Recommendations
  sectionTitle(ctx, "Strategic Recommendations");
  bulletList(ctx, report.recommendations || [], { numbered: true });

  // 12. Next steps
  if (report.nextSteps?.length) {
    sectionTitle(ctx, "Next Steps");
    bulletList(ctx, report.nextSteps, { numbered: true });
  }

  // 13. Version Context
  const hasEmbeddedVersions = (report.reportVersions?.length ?? 0) > 0;
  const hasFamily = (versionFamily?.length ?? 0) > 0;
  if (hasEmbeddedVersions || hasFamily) {
    sectionTitle(ctx, "Version Context");
    if (hasFamily) {
      subTitle(ctx, "Report Family");
      autoTable(pdf, {
        startY: ctx.y,
        margin: { left: M, right: M },
        head: [["#", "Title", "Date", "Current"]],
        body: versionFamily!.map((v, i) => [
          `v${i + 1}`,
          s(v.title || "Untitled"),
          new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          v.isCurrent ? "✓" : "",
        ]),
        columnStyles: { 0: { cellWidth: 40, halign: "center" }, 2: { cellWidth: 90 }, 3: { cellWidth: 60, halign: "center" } },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4 },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: COLORS.surface },
        didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
      });
      ctx.y = (pdf as any).lastAutoTable.finalY + 8;
    }
    if (hasEmbeddedVersions) {
      subTitle(ctx, "Version Deltas");
      autoTable(pdf, {
        startY: ctx.y,
        margin: { left: M, right: M },
        head: [["When", "Prev Score", "New Score", "Δ Score", "Prev Conf", "New Conf", "Δ Conf", "Prev AI %", "New AI %", "Summary"]],
        body: report.reportVersions!.map((v) => [
          new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          v.previousScore.toFixed(1),
          v.newScore.toFixed(1),
          (v.scoreDelta >= 0 ? "+" : "") + v.scoreDelta.toFixed(1),
          `${Math.round(v.previousConfidence)}%`,
          `${Math.round(v.newConfidence)}%`,
          (v.confidenceDelta >= 0 ? "+" : "") + Math.round(v.confidenceDelta) + "%",
          `${Math.round(v.previousAiAssumptionPercent)}%`,
          `${Math.round(v.newAiAssumptionPercent)}%`,
          s(v.summary),
        ]),
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 3, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak" },
        headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: COLORS.surface },
        didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
      });
      ctx.y = (pdf as any).lastAutoTable.finalY + 8;
    }
  }

  // 14. Dashboard snapshot
  if (dashRadar || dashBars) {
    sectionTitle(ctx, "Live Dashboard Snapshot");
    if (dashRadar) { subTitle(ctx, "FMART Radar"); await placeChart(ctx, dashRadar, 210); }
    if (dashBars)  { subTitle(ctx, "Score Distribution"); await placeChart(ctx, dashBars, 180); }
  }

  // 15. Assumption Register (final page)
  const register = deriveAssumptionRegister(report, inputs);
  if (register.length) {
    addPage(ctx);
    sectionTitle(ctx, "Assumption Register");
    paragraph(
      ctx,
      "Only the most material assumptions are shown. Add stronger evidence to improve confidence and reduce uncertainty.",
      { size: 9, italic: true, color: COLORS.muted },
    );
    if (report.legacyEvidence) {
      notice(
        ctx,
        "Evidence detail was estimated from the available report data. Re-run analysis to calculate full input quality and evidence mix.",
        "info",
      );
    }
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Assumption", "Section", "Source", "Evidence", "Conf.", "Risk if wrong", "How to validate", "What to add", "Expected impact"]],
      body: register.map((r: AssumptionRow) => [
        s(r.assumption),
        s(r.section),
        s(r.sourceType),
        s(r.evidenceBasis),
        s(r.confidence),
        s(r.riskIfWrong),
        s(r.howToValidate),
        s(r.whatToAdd),
        s(r.expectedImpact),
      ]),
      columnStyles: {
        0: { cellWidth: 78 },
        1: { cellWidth: 52 },
        2: { cellWidth: 52, fontStyle: "bold" },
        3: { cellWidth: 60 },
        4: { cellWidth: 32, halign: "center" },
        5: { cellWidth: 62 },
        6: { cellWidth: 60 },
        7: { cellWidth: 60 },
        8: { cellWidth: 60 },
      },
      styles: { font: "helvetica", fontSize: 6.8, cellPadding: 3, textColor: COLORS.text, lineColor: COLORS.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: COLORS.surface },
      didDrawPage: () => { pageHeader(ctx); pageFooter(ctx); },
    });
    ctx.y = (pdf as any).lastAutoTable.finalY + 8;
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
