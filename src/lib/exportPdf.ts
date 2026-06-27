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

/* =============================================================================
 * Concept AI — Phase A PDF exporter
 *  - Native jsPDF + autoTable
 *  - Named chart registry via [data-pdf-chart="..."]
 *  - Dynamic section numbering + TOC
 *  - "Page X of Y" stamped in a final pass
 *  - Verdict / recommendation de-duplication
 *  - No dashboard snapshot, no duplicate radar
 * ========================================================================== */

/* ---------- palette ---------- */
const C = {
  primary:     [31, 78, 216]    as RGB,
  primaryDark: [15, 23, 42]     as RGB,
  text:        [15, 23, 42]     as RGB,
  muted:       [100, 116, 139]  as RGB,
  border:      [203, 213, 225]  as RGB,
  surface:     [248, 250, 252]  as RGB,
  success:     [22, 163, 74]    as RGB,
  warning:     [245, 158, 11]   as RGB,
  destructive: [220, 38, 38]    as RGB,
  white:       [255, 255, 255]  as RGB,
  softBlue:    [239, 246, 255]  as RGB,
  softWarn:    [255, 247, 237]  as RGB,
  warnText:    [124, 45, 18]    as RGB,
  userInput:   [34, 139, 230]   as RGB,
  webResearch: [22, 163, 74]    as RGB,
  aiAssump:    [245, 158, 11]   as RGB,
};
type RGB = [number, number, number];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 28;
const BOTTOM_LIMIT = PAGE_H - 56;

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));
const setColor = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
const setFill  = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
const setDraw  = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);

/* ---------- verdict helpers ---------- */
const verdictColor = (v: string): RGB => {
  const u = (v || "").toUpperCase();
  if (u === "PROCEED") return C.success;
  if (u.startsWith("CONDITIONAL") || u === "PROCEED WITH CAUTION" || u === "IMPROVE INPUTS BEFORE INVESTMENT DECISION")
    return C.warning;
  if (u === "REVISE") return [234, 88, 12];
  return C.destructive;
};

/** If recommendation label starts with the same word(s) as the verdict, strip them. */
function cleanRecommendationLabel(verdict: string, label: string): string {
  const v = (verdict || "").trim();
  const l = (label || "").trim();
  if (!l) return "";
  if (!v) return l;
  if (l.toUpperCase() === v.toUpperCase()) return "";
  // Strip leading verdict tokens (e.g. "PROCEED Proceed with validation" → "with validation")
  const tokens = v.split(/\s+/);
  let stripped = l;
  for (const t of tokens) {
    const re = new RegExp("^" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,:.;—-]+", "i");
    if (re.test(stripped)) stripped = stripped.replace(re, "");
  }
  stripped = stripped.replace(/^[\s,:.;—-]+/, "").trim();
  // If what's left is empty or echoes the verdict word again, drop it.
  if (!stripped) return "";
  if (stripped.toUpperCase() === v.toUpperCase()) return "";
  return stripped;
}

/* ---------- ctx + TOC ---------- */
interface TocEntry { number: number; title: string; page: number; }
interface PdfCtx {
  pdf: jsPDF;
  y: number;
  sectionNum: number;
  projectName: string;
  reportId: string;
  toc: TocEntry[];
}

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > BOTTOM_LIMIT) addPage(ctx);
}

function pageHeader(pdf: jsPDF, projectName: string) {
  setColor(pdf, C.primary);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", M, 30);
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "normal");
  const name = s(projectName);
  if (name) pdf.text(name, PAGE_W - M, 30, { align: "right" });
  setDraw(pdf, C.primary); pdf.setLineWidth(1.2);
  pdf.line(M, 38, PAGE_W - M, 38);
}

/** Footer without the page number (page number is stamped in a final pass). */
function pageFooterChrome(pdf: jsPDF, reportId: string) {
  setDraw(pdf, C.border); pdf.setLineWidth(0.5);
  pdf.line(M, PAGE_H - 44, PAGE_W - M, PAGE_H - 44);
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  pdf.text("Confidential · AI-Generated · Not financial advice", M, FOOTER_Y);
  pdf.text(`Report ${reportId}`, PAGE_W - M, FOOTER_Y, { align: "right" });
}

function addPage(ctx: PdfCtx) {
  ctx.pdf.addPage();
  ctx.y = 60;
  pageHeader(ctx.pdf, ctx.projectName);
  pageFooterChrome(ctx.pdf, ctx.reportId);
}

/* ---------- typography ---------- */
function sectionTitle(ctx: PdfCtx, title: string): number {
  ensureSpace(ctx, 30);
  if (ctx.y > 100) ctx.y += 4;
  const { pdf } = ctx;
  const n = ctx.sectionNum++;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  setColor(pdf, C.primary);
  pdf.text(`${n}.`, M, ctx.y);
  setColor(pdf, C.text);
  pdf.text(s(title).toUpperCase(), M + 22, ctx.y);
  setDraw(pdf, C.primary); pdf.setLineWidth(0.8);
  pdf.line(M, ctx.y + 4, M + 24, ctx.y + 4);
  ctx.toc.push({ number: n, title: s(title), page: pdf.getCurrentPageInfo().pageNumber });
  ctx.y += 18;
  return n;
}

function subTitle(ctx: PdfCtx, text: string) {
  ensureSpace(ctx, 20);
  ctx.y += 2;
  const { pdf } = ctx;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
  setColor(pdf, [51, 65, 85]);
  pdf.text(s(text).toUpperCase(), M, ctx.y);
  ctx.y += 12;
}

function paragraph(
  ctx: PdfCtx, text: string,
  opts: { size?: number; color?: RGB; gap?: number; italic?: boolean } = {},
) {
  const safe = s(text); if (!safe) return;
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", opts.italic ? "italic" : "normal");
  pdf.setFontSize(size);
  setColor(pdf, opts.color ?? C.text);
  const lines = pdf.splitTextToSize(safe, CONTENT_W) as string[];
  const lh = size * 1.35;
  for (const ln of lines) { ensureSpace(ctx, lh); pdf.text(ln, M, ctx.y); ctx.y += lh; }
  ctx.y += opts.gap ?? 3;
}

function bulletList(ctx: PdfCtx, items: string[], opts: { numbered?: boolean; size?: number } = {}) {
  const { pdf } = ctx;
  const size = opts.size ?? 9.5;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(size);
  const lh = size * 1.45;
  (items || []).forEach((it, idx) => {
    const text = s(it); if (!text) return;
    const marker = opts.numbered ? `${idx + 1}.` : "•";
    const indent = 14;
    const lines = pdf.splitTextToSize(text, CONTENT_W - indent) as string[];
    ensureSpace(ctx, lh * lines.length + 2);
    setColor(pdf, C.primary); pdf.setFont("helvetica", "bold");
    pdf.text(marker, M, ctx.y);
    pdf.setFont("helvetica", "normal"); setColor(pdf, C.text);
    lines.forEach((ln, i) => pdf.text(ln, M + indent, ctx.y + i * lh));
    ctx.y += lh * lines.length + 2;
  });
  ctx.y += 2;
}

function kv(ctx: PdfCtx, label: string, value: string | undefined) {
  const safe = s(value); if (!safe) return;
  const { pdf } = ctx;
  pdf.setFontSize(9);
  const valLines = pdf.splitTextToSize(safe, CONTENT_W - 130) as string[];
  ensureSpace(ctx, valLines.length * 12 + 2);
  setColor(pdf, C.muted); pdf.setFont("helvetica", "bold");
  pdf.text(label, M, ctx.y);
  setColor(pdf, C.text); pdf.setFont("helvetica", "normal");
  pdf.text(valLines, M + 130, ctx.y);
  ctx.y += Math.max(12, valLines.length * 12) + 2;
}

function notice(ctx: PdfCtx, text: string, tone: "info" | "warn" = "info") {
  const safe = s(text); if (!safe) return;
  const { pdf } = ctx;
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8.5);
  const lines = pdf.splitTextToSize(safe, CONTENT_W - 16) as string[];
  const h = lines.length * 11 + 10;
  ensureSpace(ctx, h + 6);
  setFill(pdf, tone === "warn" ? C.softWarn : C.softBlue);
  setDraw(pdf, tone === "warn" ? C.warning : C.primary);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(M, ctx.y, CONTENT_W, h, 4, 4, "FD");
  setColor(pdf, tone === "warn" ? C.warnText : C.primaryDark);
  lines.forEach((ln, i) => pdf.text(ln, M + 8, ctx.y + 13 + i * 11));
  ctx.y += h + 6;
}

/* ---------- chart registry ---------- */

type ChartMap = Record<string, string | null>;

async function captureChartsByName(rootEl: HTMLElement): Promise<ChartMap> {
  const out: ChartMap = {};
  const nodes = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-pdf-chart]"));
  for (const node of nodes) {
    const name = node.dataset.pdfChart || "";
    if (!name) continue;
    const target = (node.querySelector(".recharts-wrapper") as HTMLElement) || node;
    const rect = target.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) { out[name] = null; continue; }
    try {
      const c = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      // Skip if essentially blank (white pixels only) — heuristic by size of dataURL.
      const url = c.toDataURL("image/png");
      out[name] = url && url.length > 2000 ? url : null;
    } catch {
      out[name] = null;
    }
  }
  return out;
}

function fitImage(imgW: number, imgH: number, maxW: number, maxH: number) {
  const r = imgW / imgH;
  let w = maxW, h = maxW / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  return { w, h };
}

async function placeChart(ctx: PdfCtx, dataUrl: string | null | undefined, maxH = 210) {
  if (!dataUrl) return;
  const { pdf } = ctx;
  const props = pdf.getImageProperties(dataUrl);
  const { w, h } = fitImage(props.width, props.height, CONTENT_W, maxH);
  ensureSpace(ctx, h + 8);
  const x = M + (CONTENT_W - w) / 2;
  pdf.addImage(dataUrl, "PNG", x, ctx.y, w, h);
  ctx.y += h + 8;
}

/* ---------- provenance bar ---------- */

function provenanceBar(
  pdf: jsPDF,
  x: number, y: number, width: number, height: number,
  mix: { userInputPercent: number; webResearchPercent: number; aiAssumptionPercent: number },
): number {
  const u = Math.max(0, mix.userInputPercent);
  const w = Math.max(0, mix.webResearchPercent);
  const a = Math.max(0, mix.aiAssumptionPercent);
  const total = u + w + a || 1;
  const uw = (u / total) * width;
  const ww = (w / total) * width;
  const aw = width - uw - ww;
  setFill(pdf, C.userInput);   pdf.rect(x, y, uw, height, "F");
  setFill(pdf, C.webResearch); pdf.rect(x + uw, y, ww, height, "F");
  setFill(pdf, C.aiAssump);    pdf.rect(x + uw + ww, y, aw, height, "F");
  // legend
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); setColor(pdf, C.text);
  let lx = x;
  const items: Array<[string, RGB]> = [
    [`User input ${u}%`, C.userInput],
    [`Web research ${w}%`, C.webResearch],
    [`AI assumption ${a}%`, C.aiAssump],
  ];
  const ly = y + height + 14;
  items.forEach(([label, c]) => {
    setFill(pdf, c); pdf.rect(lx, ly - 7, 8, 8, "F");
    setColor(pdf, C.text);
    pdf.text(label, lx + 12, ly);
    lx += pdf.getTextWidth(label) + 24;
  });
  return ly + 6;
}

/* ---------- cover ---------- */

function drawCover(
  pdf: jsPDF,
  report: FeasibilityReport,
  inputs: ConceptInputs,
) {
  const decision = report.decision;
  const mix = report.evidenceMix;
  const confidencePct = decision?.overallConfidencePct ?? 0;
  const verdictText = (decision?.verdict || report.scores.verdict || "").toString();
  const recoTail = cleanRecommendationLabel(verdictText, decision?.recommendationLabel || "");

  // Top band
  setFill(pdf, C.primary);
  pdf.rect(0, 0, PAGE_W, 96, "F");
  setColor(pdf, C.white);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("CONCEPT AI", M, 44);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text("Confidential Strategic Analysis", M, 60);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  pdf.text(`Report ${report.reportId}`, PAGE_W - M, 44, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(s(report.dateIssued), PAGE_W - M, 60, { align: "right" });

  // Title block
  let y = 140;
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
  pdf.text("FEASIBILITY REPORT", M, y);
  y += 26;
  setColor(pdf, C.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(26);
  const titleLines = pdf.splitTextToSize(s(inputs.projectName) || "Untitled Project", CONTENT_W) as string[];
  titleLines.slice(0, 2).forEach((ln) => { pdf.text(ln, M, y); y += 30; });

  if (inputs.location || inputs.industry) {
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
    pdf.text(s([inputs.industry, inputs.location].filter(Boolean).join(" · ")), M, y);
    y += 16;
  }

  // Verdict pill + (clean) recommendation tail
  y += 12;
  const vColor = verdictColor(verdictText);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
  const pillTxt = s(verdictText) || "—";
  const vw = pdf.getTextWidth(pillTxt) + 24;
  setFill(pdf, vColor);
  pdf.roundedRect(M, y, vw, 22, 4, 4, "F");
  setColor(pdf, C.white);
  pdf.text(pillTxt, M + 12, y + 15);
  if (recoTail) {
    setColor(pdf, C.text);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(s(recoTail), M + vw + 12, y + 15);
  }
  y += 32;

  // Next step
  if (decision?.nextStepHint) {
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(9.5);
    const ns = pdf.splitTextToSize(`Next step — ${s(decision.nextStepHint)}`, CONTENT_W) as string[];
    ns.slice(0, 2).forEach((ln) => { pdf.text(ln, M, y); y += 12; });
    y += 2;
  }

  // Top blockers (max 3)
  if (decision?.blockers?.length) {
    setColor(pdf, C.warnText);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
    pdf.text("TOP BLOCKERS", M, y);
    y += 11;
    pdf.setFont("helvetica", "normal"); setColor(pdf, C.text);
    decision.blockers.slice(0, 3).forEach((b) => {
      const lines = pdf.splitTextToSize(`• ${s(b)}`, CONTENT_W) as string[];
      lines.slice(0, 2).forEach((ln) => { pdf.text(ln, M, y); y += 12; });
    });
    y += 4;
  }

  // 2x2 KPI grid
  const kpis: Array<[string, string]> = [
    ["OVERALL SCORE",        `${(report.scores.overall ?? 0).toFixed(1)} / 10`],
    ["DECISION CONFIDENCE",  confidencePct ? `${confidencePct}%` : "—"],
    ["AI ASSUMPTIONS",       mix ? `${mix.aiAssumptionPercent}%` : "—"],
    ["BREAK-EVEN (BASE)",    s(report.financials.breakEvenSummary) || "—"],
  ];
  const cols = 2, gap = 12;
  const colW = (CONTENT_W - gap) / cols;
  const rowH = 60;
  kpis.forEach((k, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = M + col * (colW + gap);
    const ky = y + row * (rowH + gap);
    setFill(pdf, C.surface); setDraw(pdf, C.border); pdf.setLineWidth(0.5);
    pdf.roundedRect(x, ky, colW, rowH, 6, 6, "FD");
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
    pdf.text(k[0], x + 12, ky + 18);
    setColor(pdf, C.text);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
    const v = pdf.splitTextToSize(k[1], colW - 24) as string[];
    pdf.text(v[0], x + 12, ky + 42);
  });
  y += rowH * 2 + gap + 16;

  // Data Provenance Snapshot
  setColor(pdf, C.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("DATA PROVENANCE", M, y);
  y += 10;
  if (mix) {
    y = provenanceBar(pdf, M, y, CONTENT_W, 12, mix);
  }
  // 3-tier legend
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8);
  const legend = [
    "AI assumption <30%: stronger confidence  ·  30–40%: validate key inputs  ·  >40%: exploratory — strengthen before decision.",
  ];
  legend.forEach((ln) => {
    const lines = pdf.splitTextToSize(ln, CONTENT_W) as string[];
    lines.forEach((l) => { pdf.text(l, M, y); y += 10; });
  });

  if (mix && mix.aiAssumptionPercent > 40) {
    y += 4;
    setFill(pdf, C.softWarn); setDraw(pdf, C.warning); pdf.setLineWidth(0.6);
    const warnLines = pdf.splitTextToSize(
      "High AI assumption dependency — validate the key assumptions in the Assumption Register before any investment or launch decision.",
      CONTENT_W - 14,
    ) as string[];
    const wh = warnLines.length * 11 + 10;
    pdf.roundedRect(M, y, CONTENT_W, wh, 4, 4, "FD");
    setColor(pdf, C.warnText);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
    warnLines.forEach((ln, i) => pdf.text(ln, M + 8, y + 13 + i * 11));
    y += wh + 6;
  }

  if (report.legacyEvidence) {
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(8);
    pdf.text("Evidence mix estimated from available report data.", M, y);
  }

  // Footer band
  setFill(pdf, C.primary);
  pdf.rect(0, PAGE_H - 44, PAGE_W, 44, "F");
  setColor(pdf, C.white);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
  pdf.text("Auto-generated by AI. Not financial or legal advice.", M, PAGE_H - 22);
  pdf.setFont("helvetica", "bold");
  pdf.text("CONCEPT AI", PAGE_W - M, PAGE_H - 22, { align: "right" });
}

/* ---------- TOC (rendered at the end, then moved to page 2) ---------- */

function renderTocPage(ctx: PdfCtx) {
  // Render TOC on a brand-new page at the end
  ctx.pdf.addPage();
  const pdf = ctx.pdf;
  pageHeader(pdf, ctx.projectName);
  pageFooterChrome(pdf, ctx.reportId);
  let y = 80;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); setColor(pdf, C.text);
  pdf.text("Table of Contents", M, y);
  y += 28;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  ctx.toc.forEach((entry) => {
    // Dotted leader
    const title = `${entry.number}. ${entry.title}`;
    // The TOC will be moved to page 2, so all original page numbers shift +1.
    const displayPage = entry.page + 1;
    const pageStr = String(displayPage);
    setColor(pdf, C.text);
    pdf.setFont("helvetica", "bold");
    pdf.text(title, M, y);
    const titleW = pdf.getTextWidth(title);
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "normal");
    const pageW = pdf.getTextWidth(pageStr);
    const dotsStart = M + titleW + 6;
    const dotsEnd = PAGE_W - M - pageW - 6;
    if (dotsEnd > dotsStart) {
      const dots = ".".repeat(Math.max(0, Math.floor((dotsEnd - dotsStart) / 2.4)));
      pdf.text(dots, dotsStart, y);
    }
    pdf.text(pageStr, PAGE_W - M, y, { align: "right" });
    y += 18;
    if (y > BOTTOM_LIMIT) return; // truncate gracefully
  });

  // Move newly-added last page to position 2 (right after the cover)
  const last = pdf.getNumberOfPages();
  if (last > 2) pdf.movePage(last, 2);
}

/* ---------- final "Page X of Y" stamp ---------- */

function stampPageNumbers(pdf: jsPDF) {
  const total = pdf.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    pdf.setPage(i);
    // Clear small strip above old footer
    setFill(pdf, C.white);
    pdf.rect(PAGE_W / 2 - 60, PAGE_H - 36, 120, 14, "F");
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
    pdf.text(`Page ${i} of ${total}`, PAGE_W / 2, FOOTER_Y, { align: "center" });
  }
}

/* ---------- Assumption Register helpers (Phase A redesign) ---------- */

type RegisterBucket = "Market" | "Financial" | "Operational" | "Risk / Compliance";

function bucketFor(section: string): RegisterBucket {
  const t = (section || "").toLowerCase();
  if (t.includes("market") || t.includes("customer") || t.includes("competit") || t.includes("timing")) return "Market";
  if (t.includes("financ") || t.includes("capex") || t.includes("opex") || t.includes("revenue") || t.includes("funding")) return "Financial";
  if (t.includes("risk") || t.includes("regul") || t.includes("compli")) return "Risk / Compliance";
  return "Operational";
}

function rankRows(rows: AssumptionRow[]): AssumptionRow[] {
  const score = (r: AssumptionRow) => {
    let n = 0;
    if (r.confidence === "Low") n += 3; else if (r.confidence === "Medium") n += 1;
    const src = r.sourceType;
    if (src === "AI assumption" || src === "Needs validation") n += 2;
    if (/high|critical|block/i.test(r.riskIfWrong || "")) n += 2;
    return n;
  };
  return [...rows].sort((a, b) => score(b) - score(a));
}

/* =============================================================================
 * MAIN ENTRYPOINT
 * ========================================================================== */

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
  const data = payload ?? (window as never as { __pdfPayload?: unknown }).__pdfPayload;
  if (!data || typeof data !== "object" || !("report" in data) || !("inputs" in data))
    throw new Error("Missing report data for PDF export.");
  const { report: rawReport, inputs, versionFamily } = data as {
    report: FeasibilityReport; inputs: ConceptInputs; versionFamily?: VersionFamilyEntry[];
  };

  const report = ensureEvidenceFields(rawReport, inputs);
  const decision = report.decision;
  const mix = report.evidenceMix;
  const iq = assessInputQuality(inputs);

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const ctx: PdfCtx = {
    pdf, y: 60, sectionNum: 1,
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
    toc: [],
  };

  /* ===== Cover (page 1) ===== */
  drawCover(pdf, report, inputs);

  /* ===== Charts (named registry) ===== */
  const charts = await captureChartsByName(rootEl);
  const fmartRadar  = charts["fmart-radar"]   ?? null;
  const marketChart = charts["market-growth"] ?? null;
  const capexChart  = charts["capex"]         ?? null;

  /* ===== Body starts on page 2 (TOC will be moved here at the end) ===== */
  addPage(ctx);

  /* 1. Executive Summary */
  sectionTitle(ctx, "Executive Summary");
  paragraph(ctx, report.executiveSummary, { size: 9.5 });

  if (decision || report.scores.verdict) {
    const verdictText = decision?.verdict || report.scores.verdict;
    const tail = cleanRecommendationLabel(verdictText, decision?.recommendationLabel || "");
    const conf = decision?.overallConfidencePct;
    const line1 = `Verdict: ${s(verdictText)}${tail ? " — " + s(tail) : ""}.`;
    const line2 = decision?.nextStepHint ? ` Next step — ${s(decision.nextStepHint)}.` : "";
    const line3 = conf != null ? ` Confidence: ${conf}%.` : "";
    notice(ctx, line1 + line2 + line3, "info");
  }

  /* 2. Decision Scorecard (single FMART table + single radar) */
  sectionTitle(ctx, "Decision Scorecard");
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
      { content: "OVERALL WEIGHTED SCORE", styles: { fillColor: C.softBlue, textColor: C.primary, fontStyle: "bold" } },
      { content: `${report.scores.overall.toFixed(1)} / 10`, styles: { fillColor: C.softBlue, textColor: C.primary, fontStyle: "bold" } },
      { content: "", styles: { fillColor: C.softBlue } },
    ]],
    columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 70, halign: "center" }, 2: { cellWidth: CONTENT_W - 210 } },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (fmartRadar) {
    subTitle(ctx, "FMART 6-Dimension Radar");
    await placeChart(ctx, fmartRadar, 220);
  }

  /* 3. Why this score? — readable layout (one row per dim, implication below) */
  if (report.scoreExplanation?.length) {
    sectionTitle(ctx, "Why this score?");
    paragraph(
      ctx,
      "What helped, what lowered, and the single most useful action per dimension. Decision implication appears under each row.",
      { size: 9, italic: true, color: C.muted },
    );
    autoTable(pdf, {
      startY: ctx.y,
      margin: { left: M, right: M },
      head: [["Dimension", "Score", "What helped", "What lowered", "Action"]],
      body: report.scoreExplanation.flatMap((r) => {
        const main = [
          { content: s(r.label), styles: { fontStyle: "bold" as const } },
          { content: `${(r.score ?? 0).toFixed(1)}`, styles: { halign: "center" as const } },
          s((r.positiveDrivers || []).slice(0, 3).join(" · ")),
          s([...(r.negativeDrivers || []), ...(r.missingEvidence || [])].slice(0, 3).join(" · ")),
          s((r.improvementActions || []).slice(0, 2).join(" · ")),
        ];
        const implication = r.decisionImplication
          ? [{
              content: `Implication: ${s(r.decisionImplication)}`,
              colSpan: 5,
              styles: { fillColor: C.softBlue, textColor: C.primaryDark, fontStyle: "italic" as const, fontSize: 8.5 },
            }]
          : null;
        return implication ? [main, implication] : [main];
      }),
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 38, halign: "center" },
        2: { cellWidth: 120 },
        3: { cellWidth: 120 },
        4: { cellWidth: CONTENT_W - 90 - 38 - 120 - 120 },
      },
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 9 },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  /* 4. Input Quality */
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
  const weak    = report.inputCompleteness?.weakFields    ?? [...iq.weak, ...iq.needsImprovement];
  const contra  = report.inputCompleteness?.contradictoryFields ?? iq.contradictions;
  if (missing?.length) { subTitle(ctx, "Missing fields"); bulletList(ctx, missing, { size: 9 }); }
  if (weak?.length)    { subTitle(ctx, "Weak / needs improvement"); bulletList(ctx, weak, { size: 9 }); }
  if (contra?.length)  { subTitle(ctx, "Possible contradictions"); bulletList(ctx, contra, { size: 9 }); }

  const fieldSuggestions = iq.fields.filter((f) => f.status !== "complete").slice(0, 8);
  if (fieldSuggestions.length) {
    subTitle(ctx, "Top field-level suggestions");
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      head: [["Field", "Status", "Why it matters", "What to add"]],
      body: fieldSuggestions.map((f) => [s(f.label), s(f.status.replace("_", " ")), s(f.impact), s(f.suggestion)]),
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 80 } },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  /* 5. Evidence Mix */
  if (mix) {
    sectionTitle(ctx, "Evidence Mix");
    ensureSpace(ctx, 60);
    ctx.y = provenanceBar(pdf, M, ctx.y, CONTENT_W, 14, mix);
    notice(
      ctx,
      mix.aiAssumptionPercent > 40
        ? "High AI assumption dependency — strengthen inputs and validate key assumptions before investment."
        : mix.aiAssumptionPercent > 30
          ? "Medium AI assumption dependency — validate the key assumptions in the register below."
          : "Low AI assumption dependency — stronger confidence in the analysis.",
      mix.aiAssumptionPercent > 40 ? "warn" : "info",
    );
  }

  /* 6. Evidence behind this report (claim map) */
  if (report.claimEvidenceMap?.length) {
    sectionTitle(ctx, "Evidence behind this report");
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      head: [["Claim", "Section", "User", "Web", "AI", "Conf.", "How to strengthen"]],
      body: report.claimEvidenceMap.map((c) => [
        s(c.claimText), s(c.reportSection),
        `${c.userInputPercent}%`, `${c.webResearchPercent}%`, `${c.aiAssumptionPercent}%`,
        s(c.confidence), s(c.userCanImproveBy),
      ]),
      columnStyles: {
        0: { cellWidth: 150 }, 1: { cellWidth: 70 },
        2: { cellWidth: 30, halign: "center" }, 3: { cellWidth: 30, halign: "center" },
        4: { cellWidth: 30, halign: "center" }, 5: { cellWidth: 40, halign: "center" },
      },
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: 3.5, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles: { fillColor: C.surface },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  /* 7. Market */
  sectionTitle(ctx, "Market Analysis");
  subTitle(ctx, "Market Sizing (TAM · SAM · SOM)");
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    head: [["Tier", "Label", "Value", "CAGR"]],
    body: [
      ["TAM", s(report.market.tamLabel), s(report.market.tamValue), s(report.market.tamCagr)],
      ["SAM", s(report.market.samLabel), s(report.market.samValue), s(report.market.samCagr)],
      ["SOM", s(report.market.somLabel), s(report.market.somValue), s(report.market.somCagr)],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (marketChart) { subTitle(ctx, "Market Growth Projection"); await placeChart(ctx, marketChart, 180); }

  subTitle(ctx, "Customer Profile");
  const cust = report.customer;
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    body: [
      ["Age & Location",     s(cust.ageLocation)],
      ["Income",             s(cust.income)],
      ["Goals",              s(cust.goals)],
      ["Willingness to Pay", s(cust.willingnessToPay)],
      ["Behavior",           s(cust.behavior)],
    ],
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: C.surface } },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (report.competitors?.length) {
    subTitle(ctx, "Competitive Landscape");
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      head: [["Competitor", "Model", "Weakness", "Competitor Strength / Gap"]],
      body: report.competitors.map((c) => [s(c.name), s(c.model), s(c.weakness), s(c.edge)]),
      columnStyles: {
        0: { cellWidth: 100, fontStyle: "bold" },
        1: { cellWidth: 110 },
        2: { cellWidth: 130 },
        3: { cellWidth: CONTENT_W - 340 },
      },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  if (report.research) {
    const r = report.research;
    subTitle(ctx, "Market Research & Signals");
    paragraph(ctx, r.overview, { size: 9 });
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      body: [["Confidence", s(r.confidence)], ["Sentiment", s(r.sentiment)]],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: C.surface } },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4 },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    if (r.keySignals?.length)         { subTitle(ctx, "Key Signals");         bulletList(ctx, r.keySignals,        { size: 9 }); }
    if (r.painPoints?.length)         { subTitle(ctx, "Pain Points");         bulletList(ctx, r.painPoints,        { size: 9 }); }
    if (r.competitorMentions?.length) { subTitle(ctx, "Competitor Mentions"); bulletList(ctx, r.competitorMentions, { size: 9 }); }
    if (r.redditSignals?.length)      { subTitle(ctx, "Reddit Signals");      bulletList(ctx, r.redditSignals,     { size: 9 }); }
    if (r.webSignals?.length)         { subTitle(ctx, "Web Signals");         bulletList(ctx, r.webSignals,        { size: 9 }); }
    if (r.citations?.length) {
      subTitle(ctx, "Citations");
      autoTable(pdf, {
        startY: ctx.y, margin: { left: M, right: M },
        head: [["Source", "Title", "Takeaway"]],
        body: r.citations.map((c) => [s(c.source), s(c.title), s(c.takeaway)]),
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 170 }, 2: { cellWidth: CONTENT_W - 260 } },
        styles: { font: "helvetica", fontSize: 8.2, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: C.surface },
        didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
      });
      ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
  }

  /* 8. Financials */
  sectionTitle(ctx, "Financial Analysis");
  notice(
    ctx,
    "Financial forecast (24-month deterministic simulator) is not available for this report version. Re-run analysis once Financial Model v2 is enabled.",
    "info",
  );
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    body: [
      ["Investment Range", s(report.financials.investmentRange)],
      ["Break-Even",       s(report.financials.breakEvenSummary)],
      ...(report.financials.ltvCacRatio ? [["LTV : CAC", s(report.financials.ltvCacRatio)]] : []),
      ["CapEx (Mid)",      s(`${report.financials.currency} ${report.financials.capExTotal.mid.toLocaleString()}  (range ${report.financials.capExTotal.low.toLocaleString()}–${report.financials.capExTotal.high.toLocaleString()})`)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130, fillColor: C.surface } },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  subTitle(ctx, `Capital Expenditure (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    head: [["Category", "Low", "High", "Notes"]],
    body: report.financials.capEx.map((c) => [s(c.category), c.low.toLocaleString(), c.high.toLocaleString(), s(c.notes)]),
    columnStyles: { 0: { cellWidth: 130, fontStyle: "bold" }, 1: { cellWidth: 60, halign: "right" }, 2: { cellWidth: 60, halign: "right" } },
    styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  if (capexChart) await placeChart(ctx, capexChart, 180);

  subTitle(ctx, `Operating Expenses (${report.financials.currency})`);
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    head: [["Category", "Monthly", "Annual"]],
    body: report.financials.opEx.map((c) => [s(c.category), c.monthly.toLocaleString(), c.annual.toLocaleString()]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  subTitle(ctx, "Revenue Scenarios");
  const internal = isInternalProject(report);
  const custLabel = internal ? "Internal Users" : "Yr 1 Customers";
  const revLabel  = internal ? "Annual Savings / Value Realized" : "Annual Revenue";
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    head: [["Scenario", "Probability", custLabel, revLabel, "Break-Even"]],
    body: report.financials.scenarios.map((sc) => [s(sc.scenario), s(sc.probability), s(sc.subscribersYr1), s(sc.annualRevenue), s(sc.breakEven)]),
    styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  /* 9. Risks */
  sectionTitle(ctx, "Risk Assessment");
  autoTable(pdf, {
    startY: ctx.y, margin: { left: M, right: M },
    head: [["Risk", "Prob.", "Impact", "Level", "Mitigation"]],
    body: report.risks.map((r) => [s(r.name), s(r.probability), s(r.impact), s(r.level), s(r.mitigation)]),
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold" },
      1: { cellWidth: 46, halign: "center" }, 2: { cellWidth: 46, halign: "center" }, 3: { cellWidth: 46, halign: "center" },
      4: { cellWidth: CONTENT_W - 268 },
    },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.surface },
    didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
  });
  ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  /* 10. Funding */
  if (report.fundingMix?.length) {
    sectionTitle(ctx, "Funding Mix");
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      head: [["Source", "Share", "Amount", "Rationale"]],
      body: report.fundingMix.map((f) => [s(f.source), s(f.share), s(f.amount), s(f.rationale)]),
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 130 }, 1: { cellWidth: 60 }, 2: { cellWidth: 90 }, 3: { cellWidth: CONTENT_W - 280 } },
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    if (report.fundingAdvisory) paragraph(ctx, report.fundingAdvisory, { size: 9 });
  }

  /* 11. Strategic Recommendations */
  sectionTitle(ctx, "Strategic Recommendations");
  bulletList(ctx, report.recommendations || [], { numbered: true });

  /* 12. Next Steps */
  if (report.nextSteps?.length) {
    sectionTitle(ctx, "Next Steps");
    bulletList(ctx, report.nextSteps, { numbered: true });
  }

  /* 13. Version Context */
  const hasEmbeddedVersions = (report.reportVersions?.length ?? 0) > 0;
  const hasFamily = (versionFamily?.length ?? 0) > 0;
  if (hasEmbeddedVersions || hasFamily) {
    sectionTitle(ctx, "Version Context");
    if (hasFamily) {
      subTitle(ctx, "Report Family");
      autoTable(pdf, {
        startY: ctx.y, margin: { left: M, right: M },
        head: [["#", "Title", "Date", "Current"]],
        body: versionFamily!.map((v, i) => [
          `v${i + 1}`, s(v.title || "Untitled"),
          new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          v.isCurrent ? "✓" : "",
        ]),
        columnStyles: { 0: { cellWidth: 40, halign: "center" }, 2: { cellWidth: 100 }, 3: { cellWidth: 60, halign: "center" } },
        styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4 },
        headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
        alternateRowStyles: { fillColor: C.surface },
        didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
      });
      ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
    if (hasEmbeddedVersions) {
      subTitle(ctx, "Version Deltas");
      autoTable(pdf, {
        startY: ctx.y, margin: { left: M, right: M },
        head: [["When", "Score", "Δ", "Conf.", "Δ", "AI %", "Δ", "Summary"]],
        body: report.reportVersions!.map((v) => [
          new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          `${v.previousScore.toFixed(1)} → ${v.newScore.toFixed(1)}`,
          (v.scoreDelta >= 0 ? "+" : "") + v.scoreDelta.toFixed(1),
          `${Math.round(v.previousConfidence)} → ${Math.round(v.newConfidence)}%`,
          (v.confidenceDelta >= 0 ? "+" : "") + Math.round(v.confidenceDelta) + "%",
          `${Math.round(v.previousAiAssumptionPercent)} → ${Math.round(v.newAiAssumptionPercent)}%`,
          "",
          s(v.summary),
        ]),
        styles: { font: "helvetica", fontSize: 8, cellPadding: 3.5, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: C.surface },
        didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
      });
      ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }
  }

  /* =========================================================================
   * APPENDICES
   * ====================================================================== */

  /* Appendix A — Project Brief (full) */
  addPage(ctx);
  sectionTitle(ctx, "Appendix A — Project Brief");
  kv(ctx, "Project",            inputs.projectName);
  kv(ctx, "Industry",           inputs.industry);
  kv(ctx, "Location",           inputs.location);
  kv(ctx, "Business Model",     inputs.businessModel);
  kv(ctx, "Revenue Model",      inputs.revenueModel);
  kv(ctx, "Budget Range",       inputs.budgetRange);
  kv(ctx, "Timeline",           inputs.timeline);
  kv(ctx, "Team Size",          inputs.teamSize);
  kv(ctx, "Tech Readiness",     inputs.technologyReadiness);
  kv(ctx, "Founder Experience", inputs.founderExperience);
  if (inputs.description)              { subTitle(ctx, "Concept Description");        paragraph(ctx, inputs.description,         { size: 9 }); }
  if (inputs.strategicObjectives)      { subTitle(ctx, "Strategic Objectives");       paragraph(ctx, inputs.strategicObjectives, { size: 9 }); }
  if (inputs.assumptions)              { subTitle(ctx, "Assumptions");                paragraph(ctx, inputs.assumptions,         { size: 9 }); }
  if (inputs.constraints)              { subTitle(ctx, "Constraints");                paragraph(ctx, inputs.constraints,         { size: 9 }); }
  if (inputs.successFactors)           { subTitle(ctx, "Success Factors");            paragraph(ctx, inputs.successFactors,      { size: 9 }); }
  if (inputs.knownRisks)               { subTitle(ctx, "Known Risks");                paragraph(ctx, inputs.knownRisks,          { size: 9 }); }
  if (inputs.regulatoryConsiderations) { subTitle(ctx, "Regulatory Considerations");  paragraph(ctx, inputs.regulatoryConsiderations, { size: 9 }); }
  if (inputs.dependencies)             { subTitle(ctx, "Dependencies");               paragraph(ctx, inputs.dependencies,        { size: 9 }); }

  /* Appendix B — Assumption Register (redesigned) */
  const register = deriveAssumptionRegister(report, inputs);
  if (register.length) {
    addPage(ctx);
    sectionTitle(ctx, "Appendix B — Assumption Register");
    paragraph(
      ctx,
      "Only the most material assumptions are shown, grouped by area. Strengthen the items below to raise confidence and reduce uncertainty.",
      { size: 9, italic: true, color: C.muted },
    );
    if (report.legacyEvidence) {
      notice(ctx, "Evidence detail was estimated from the available report data. Re-run analysis to compute full input quality and evidence mix.", "info");
    }

    const buckets: RegisterBucket[] = ["Market", "Financial", "Operational", "Risk / Compliance"];
    const ranked = rankRows(register).slice(0, 15);
    const improvementPlan: string[] = [];

    buckets.forEach((bucket) => {
      const rows = ranked.filter((r) => bucketFor(r.section) === bucket);
      if (!rows.length) return;
      subTitle(ctx, bucket);
      autoTable(pdf, {
        startY: ctx.y, margin: { left: M, right: M },
        head: [["Assumption", "Source", "Conf.", "Risk if wrong", "What to add"]],
        body: rows.map((r) => [
          s(r.assumption), s(r.sourceType), s(r.confidence), s(r.riskIfWrong), s(r.whatToAdd),
        ]),
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 70 },
          2: { cellWidth: 42, halign: "center" },
          3: { cellWidth: 110 },
          4: { cellWidth: CONTENT_W - 372 },
        },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 8.8 },
        alternateRowStyles: { fillColor: C.surface },
        didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
      });
      ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

      rows.slice(0, 3).forEach((r) => {
        const validate = r.howToValidate ? `Validate: ${s(r.howToValidate)}.` : "";
        const impact   = r.expectedImpact ? ` Impact: ${s(r.expectedImpact)}.` : "";
        const line = `${s(r.assumption)} — ${validate}${impact}`.trim();
        if (line) improvementPlan.push(line);
      });
    });

    if (improvementPlan.length) {
      subTitle(ctx, "Improvement Plan — top actions");
      bulletList(ctx, improvementPlan.slice(0, 10), { size: 9 });
    }
  }

  /* Appendix C — Methodology */
  if (report.scores.weights || report.scores.confidence) {
    addPage(ctx);
    sectionTitle(ctx, "Appendix C — Methodology");
    paragraph(
      ctx,
      "FMART weighted scoring. The dimensions below show how much each score contributed to the overall recommendation, with per-dimension confidence and rationale.",
      { size: 9, color: C.muted, italic: true },
    );
    const w = report.scores.weights as Record<string, number> | undefined;
    const c = report.scores.confidence as Record<string, number> | undefined;
    const rat = report.scores.rationale as Record<string, string> | undefined;
    autoTable(pdf, {
      startY: ctx.y, margin: { left: M, right: M },
      head: [["Dimension", "Weight", "Confidence", "Rationale"]],
      body: ["financial","market","achievability","risk","timing","operational"].map((k) => [
        k.charAt(0).toUpperCase() + k.slice(1),
        w ? `${Math.round((w[k] ?? 0) * 100)}%` : "—",
        c ? formatConfidence(c[k]) : "—",
        s(rat ? (rat[k] ?? "—") : "—"),
      ]),
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 60, halign: "center" }, 2: { cellWidth: 70, halign: "center" }, 3: { cellWidth: CONTENT_W - 240 } },
      styles: { font: "helvetica", fontSize: 8.8, cellPadding: 4, textColor: C.text, lineColor: C.border, lineWidth: 0.4, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: C.surface },
      didDrawPage: () => { pageHeader(pdf, ctx.projectName); pageFooterChrome(pdf, ctx.reportId); },
    });
    ctx.y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  /* ===== TOC (rendered last, moved to page 2) ===== */
  renderTocPage(ctx);

  /* ===== Page X of Y stamp ===== */
  stampPageNumbers(pdf);

  /* ===== Save ===== */
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

  return { fileName: link.download, bytes: blob.size, pages: pdf.getNumberOfPages() };
}
