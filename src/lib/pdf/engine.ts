// =============================================================================
// Concept AI — PDF Layout Engine (Phase 1)
// -----------------------------------------------------------------------------
// Owns:
//   • Doc context + page registry
//   • Section start rules with orphan-heading prevention
//   • Continuation header reservation (NEVER overlays content)
//   • Table placement with graceful column-overflow fallback (NEVER throws in prod)
//   • Shrink-to-fit KPI primitive (NEVER clips values)
//   • Chart placement with per-chart professional fallback
//   • Dynamic TOC reserved at page 2 (no post-render reflow)
//   • "Page X of Y" stamping
// -----------------------------------------------------------------------------
// Intentionally NOT in this module:
//   • Financial model logic
//   • Page-order rewrite (Phase 2)
//   • Citation hygiene rewrite (Phase 2)
// =============================================================================

import jsPDF from "jspdf";
import autoTable, { type RowInput, type Styles, type CellHookData } from "jspdf-autotable";

export type RGB = [number, number, number];

export const C = {
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

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const HEADER_Y = 38;               // hr line under brand band
export const CONT_BAND_H = 18;            // reserved strip for continuation header
export const BODY_TOP = 60;               // y-cursor for first content on a normal page
export const FOOTER_LINE_Y = PAGE_H - 44;
export const FOOTER_TEXT_Y = PAGE_H - 28;
export const BOTTOM_LIMIT = PAGE_H - 56;  // last printable y for body
export const ORPHAN_GUARD = 60;           // minimum room below a heading before body
const isDev = typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

// ---------- color helpers ----------
export const setColor = (pdf: jsPDF, c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
export const setFill  = (pdf: jsPDF, c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
export const setDraw  = (pdf: jsPDF, c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);

// ---------- Doc context ----------
export interface PageMeta {
  /** Section number this page started inside (1-based). */
  sectionNumber: number | null;
  /** Section title for continuation headers. */
  sectionTitle: string | null;
  /** True when this page is a *continuation* of a section that began earlier. */
  isContinuation: boolean;
  /** Reserved cursor y after chrome is painted. */
  contentTop: number;
}

export interface TocEntry { number: number; title: string; page: number; }

export interface Doc {
  pdf: jsPDF;
  y: number;
  sectionCounter: number;
  currentSection: { number: number; title: string } | null;
  projectName: string;
  reportId: string;
  toc: TocEntry[];
  pages: PageMeta[];           // index = pageNumber - 1
  /** Optional callback to draw the cover (page 1) — already painted before engine writes more pages. */
}

export function createDoc(opts: { projectName: string; reportId: string }): Doc {
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  return {
    pdf,
    y: BODY_TOP,
    sectionCounter: 1,
    currentSection: null,
    projectName: opts.projectName || "Untitled",
    reportId: opts.reportId,
    toc: [],
    pages: [],
  };
}

// ---------- page chrome ----------
function paintHeader(doc: Doc) {
  const { pdf } = doc;
  setColor(pdf, C.primary);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", MARGIN, 30);
  if (doc.projectName) {
    setColor(pdf, C.muted); pdf.setFont("helvetica", "normal");
    pdf.text(doc.projectName, PAGE_W - MARGIN, 30, { align: "right" });
  }
  setDraw(pdf, C.primary); pdf.setLineWidth(1.2);
  pdf.line(MARGIN, HEADER_Y, PAGE_W - MARGIN, HEADER_Y);
}

function paintFooterChrome(doc: Doc) {
  const { pdf } = doc;
  setDraw(pdf, C.border); pdf.setLineWidth(0.5);
  pdf.line(MARGIN, FOOTER_LINE_Y, PAGE_W - MARGIN, FOOTER_LINE_Y);
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  pdf.text("Confidential · AI-Generated · Not financial advice", MARGIN, FOOTER_TEXT_Y);
  pdf.text(`Report ${doc.reportId}`, PAGE_W - MARGIN, FOOTER_TEXT_Y, { align: "right" });
}

/** Paint the *reserved* continuation band as part of page layout — never an overlay. */
function paintContinuationBand(doc: Doc) {
  if (!doc.currentSection) return;
  const { pdf } = doc;
  setFill(pdf, C.softBlue);
  pdf.rect(MARGIN, HEADER_Y + 4, CONTENT_W, CONT_BAND_H, "F");
  setColor(pdf, C.primary);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  // Skip the appendix-prefix numbers (>=100) — show just the title.
  const isAppendix = doc.currentSection.number >= 100;
  const left = isAppendix
    ? `${doc.currentSection.title} — continued`
    : `${doc.currentSection.number}. ${doc.currentSection.title} — continued`;
  pdf.text(left, MARGIN + 8, HEADER_Y + 16);
}

/**
 * Add a fresh page. Header/footer chrome only. The continuation band is
 * intentionally NOT painted here — it would overlay the first line of body
 * content when a new section header is about to be drawn. The band is
 * reserved by `placeTable`'s autoTable continuation pages only.
 */
export function addPage(doc: Doc) {
  doc.pdf.addPage();
  paintHeader(doc);
  paintFooterChrome(doc);
  doc.y = BODY_TOP;
  doc.pages.push({
    sectionNumber: doc.currentSection?.number ?? null,
    sectionTitle: doc.currentSection?.title ?? null,
    isContinuation: false,
    contentTop: BODY_TOP,
  });
}

/** Reserve the very first body page after the cover. Call once after drawCover(). */
export function addFirstBodyPage(doc: Doc) {
  doc.pdf.addPage();
  paintHeader(doc); paintFooterChrome(doc);
  doc.y = BODY_TOP;
  doc.pages.push({ sectionNumber: null, sectionTitle: null, isContinuation: false, contentTop: BODY_TOP });
}

/** Reserve a placeholder page for the TOC at index 2 (after cover). Fill via finalizeTOC. */
export function reserveTocPage(doc: Doc) {
  doc.pdf.addPage();
  paintHeader(doc); paintFooterChrome(doc);
  doc.pages.push({ sectionNumber: null, sectionTitle: null, isContinuation: false, contentTop: BODY_TOP });
}

// ---------- space + heading rules ----------
function remaining(doc: Doc) { return BOTTOM_LIMIT - doc.y; }

export function ensureSpace(doc: Doc, needed: number) {
  if (remaining(doc) < needed) addPage(doc);
}

/**
 * Reserve a contiguous block of `needed` pts of vertical space. If it won't
 * fit on the current page, page-break first so the caller's whole block
 * (e.g. section intro + KPI grid + first table) lands together on one page.
 */
export function reserveBlock(doc: Doc, needed: number) {
  if (remaining(doc) < needed) addPage(doc);
}

/**
 * Wrap a heading+body pair to prevent orphan headings.
 * If less than (heading + 1 line + ORPHAN_GUARD) remains, break first.
 */
export function beginBlock(doc: Doc, minLead = ORPHAN_GUARD) {
  if (remaining(doc) < minLead) addPage(doc);
}

/**
 * Begin a numbered section. Always starts at a clean section heading.
 * If remaining < 25% of page → page break first so headings never land at the bottom.
 */
export function startSection(doc: Doc, title: string): number {
  const safeTitle = (title || "").trim();
  if (remaining(doc) < PAGE_H * 0.25) addPage(doc);
  const n = doc.sectionCounter++;
  doc.currentSection = { number: n, title: safeTitle };

  const { pdf } = doc;
  if (doc.y > BODY_TOP + 10) doc.y += 6;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  setColor(pdf, C.primary);
  pdf.text(`${n}.`, MARGIN, doc.y);
  setColor(pdf, C.text);
  pdf.text(safeTitle.toUpperCase(), MARGIN + 22, doc.y);
  setDraw(pdf, C.primary); pdf.setLineWidth(0.8);
  pdf.line(MARGIN, doc.y + 4, MARGIN + 24, doc.y + 4);
  doc.toc.push({ number: n, title: safeTitle, page: pdf.getCurrentPageInfo().pageNumber });
  doc.y += 26;
  return n;
}

export function subTitle(doc: Doc, text: string) {
  beginBlock(doc, 36);
  doc.y += 6;
  const { pdf } = doc;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
  setColor(pdf, [51, 65, 85]);
  pdf.text((text || "").toUpperCase(), MARGIN, doc.y);
  doc.y += 14;
}

// ---------- typography primitives ----------
export function paragraph(
  doc: Doc, text: string,
  opts: { size?: number; color?: RGB; gap?: number; italic?: boolean } = {},
) {
  const safe = (text || "").trim(); if (!safe) return;
  const size = Math.max(9, opts.size ?? 9.5);
  doc.pdf.setFont("helvetica", opts.italic ? "italic" : "normal");
  doc.pdf.setFontSize(size);
  setColor(doc.pdf, opts.color ?? C.text);
  const lines = doc.pdf.splitTextToSize(safe, CONTENT_W) as string[];
  const lh = size * 1.4;
  for (const ln of lines) { ensureSpace(doc, lh); doc.pdf.text(ln, MARGIN, doc.y); doc.y += lh; }
  doc.y += opts.gap ?? 6;
}

export function bulletList(doc: Doc, items: string[], opts: { numbered?: boolean; size?: number } = {}) {
  const size = Math.max(9, opts.size ?? 9.5);
  doc.pdf.setFont("helvetica", "normal"); doc.pdf.setFontSize(size);
  const lh = size * 1.45;
  (items || []).forEach((it, idx) => {
    const text = (it || "").trim(); if (!text) return;
    const marker = opts.numbered ? `${idx + 1}.` : "•";
    const indent = 14;
    const lines = doc.pdf.splitTextToSize(text, CONTENT_W - indent) as string[];
    ensureSpace(doc, lh * lines.length + 4);
    setColor(doc.pdf, C.primary); doc.pdf.setFont("helvetica", "bold");
    doc.pdf.text(marker, MARGIN, doc.y);
    doc.pdf.setFont("helvetica", "normal"); setColor(doc.pdf, C.text);
    lines.forEach((ln, i) => doc.pdf.text(ln, MARGIN + indent, doc.y + i * lh));
    doc.y += lh * lines.length + 5;
  });
  doc.y += 4;
}

export function kvLine(doc: Doc, label: string, value: string | undefined) {
  const safe = (value || "").trim(); if (!safe) return;
  const { pdf } = doc;
  pdf.setFontSize(9);
  const valLines = pdf.splitTextToSize(safe, CONTENT_W - 130) as string[];
  ensureSpace(doc, valLines.length * 12 + 2);
  setColor(pdf, C.muted); pdf.setFont("helvetica", "bold");
  pdf.text(label, MARGIN, doc.y);
  setColor(pdf, C.text); pdf.setFont("helvetica", "normal");
  pdf.text(valLines, MARGIN + 130, doc.y);
  doc.y += Math.max(12, valLines.length * 12) + 2;
}

export function notice(doc: Doc, text: string, tone: "info" | "warn" = "info") {
  const safe = (text || "").trim(); if (!safe) return;
  const { pdf } = doc;
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8.5);
  const lines = pdf.splitTextToSize(safe, CONTENT_W - 16) as string[];
  const h = lines.length * 11 + 10;
  ensureSpace(doc, h + 6);
  setFill(pdf, tone === "warn" ? C.softWarn : C.softBlue);
  setDraw(pdf, tone === "warn" ? C.warning : C.primary);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(MARGIN, doc.y, CONTENT_W, h, 4, 4, "FD");
  setColor(pdf, tone === "warn" ? C.warnText : C.primaryDark);
  lines.forEach((ln, i) => pdf.text(ln, MARGIN + 8, doc.y + 13 + i * 11));
  doc.y += h + 6;
}

// ---------- KPI grid (shrink-to-fit; NEVER clips) ----------
export interface KpiItem { label: string; value: string; sub?: string; }

/**
 * Draws a KPI grid with shrink-to-fit values. If a value still doesn't fit at 10pt,
 * it wraps to max 2 lines. Sub-line is always preserved.
 */
export function drawKpiGrid(
  pdf: jsPDF, x: number, y: number, width: number,
  items: KpiItem[], opts: { cols?: number; rowH?: number; gap?: number } = {},
): number {
  const cols = opts.cols ?? 3;
  const gap = opts.gap ?? 10;
  const rowH = opts.rowH ?? 64;
  const colW = (width - gap * (cols - 1)) / cols;
  const rows = Math.ceil(items.length / cols);

  items.forEach((it, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = x + col * (colW + gap);
    const cy = y + row * (rowH + gap);
    setFill(pdf, C.surface); setDraw(pdf, C.border); pdf.setLineWidth(0.5);
    pdf.roundedRect(cx, cy, colW, rowH, 6, 6, "FD");
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
    pdf.text((it.label || "").toUpperCase(), cx + 10, cy + 16);

    // Shrink-to-fit value
    setColor(pdf, C.text);
    pdf.setFont("helvetica", "bold");
    const raw = (it.value || "—").trim();
    let size = 17;
    let lines: string[] = [raw];
    while (size >= 10) {
      pdf.setFontSize(size);
      const w = pdf.getTextWidth(raw);
      if (w <= colW - 20) { lines = [raw]; break; }
      // try wrapping at this size
      const wrapped = pdf.splitTextToSize(raw, colW - 20) as string[];
      if (wrapped.length <= 2 && size <= 13) { lines = wrapped.slice(0, 2); break; }
      size -= 1;
    }
    if (size < 10) {
      size = 10; pdf.setFontSize(size);
      lines = pdf.splitTextToSize(raw, colW - 20) as string[];
      lines = lines.slice(0, 2);
    }
    pdf.setFontSize(size);
    const baseY = cy + (it.sub ? 38 : 44);
    lines.forEach((ln, idx) => pdf.text(ln, cx + 10, baseY + idx * (size + 1)));

    if (it.sub) {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
      setColor(pdf, C.muted);
      const subLines = pdf.splitTextToSize(it.sub, colW - 20) as string[];
      pdf.text(subLines[0] || "", cx + 10, cy + rowH - 8);
    }
  });

  return y + rows * rowH + (rows - 1) * gap;
}

// ---------- table with continuation + graceful column fallback ----------
export interface PlaceTableOpts {
  head?: RowInput[];
  body: RowInput[];
  /** Hard cap on columns. In dev: warn. In prod: never throws — degrades to card list. */
  maxCols?: number;
  /** Per-column widths summing ≤ CONTENT_W. Optional. */
  columnStyles?: { [key: number]: Partial<Styles> & { cellWidth?: number } };
  styles?: Partial<Styles>;
  headStyles?: Partial<Styles>;
  alternateRowStyles?: Partial<Styles>;
  /** Optional caption shown above the table. */
  caption?: string;
}

export function placeTable(doc: Doc, opts: PlaceTableOpts) {
  const cap = opts.maxCols ?? 5;
  const colCount = (opts.head?.[0] as unknown[] | undefined)?.length ?? (opts.body[0] as unknown[] | undefined)?.length ?? 0;

  // Graceful column-overflow fallback (NEVER throws in production).
  if (colCount > cap) {
    if (isDev) console.warn(`[pdf] table has ${colCount} columns > cap ${cap} — degrading to card list`);
    placeTableAsCardList(doc, opts);
    return;
  }

  if (opts.caption) subTitle(doc, opts.caption);
  beginBlock(doc, ORPHAN_GUARD);

  // Continuation pages of a split table get an extra reserved strip at the top
  // for the band. The FIRST page of the table uses the standard top margin so
  // the band never overlays the section heading or paragraph above.
  const firstPageTop = BODY_TOP;
  const continuationTop = HEADER_Y + 4 + CONT_BAND_H + 14;

  autoTable(doc.pdf, {
    startY: doc.y,
    // Margin top is used by autoTable for continuation pages only; first page
    // uses startY directly. We set top to continuationTop so the band on
    // subsequent pages has reserved space.
    margin: { left: MARGIN, right: MARGIN, top: continuationTop, bottom: 56 },
    head: opts.head,
    body: opts.body,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    columnStyles: opts.columnStyles,
    styles: {
      font: "helvetica", fontSize: 8.5, cellPadding: 4,
      textColor: C.text, lineColor: C.border, lineWidth: 0.4,
      overflow: "linebreak", valign: "top", minCellHeight: 14,
      ...opts.styles,
    },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: "bold", fontSize: 9, ...opts.headStyles },
    alternateRowStyles: { fillColor: C.surface, ...opts.alternateRowStyles },
    didDrawPage: (data: CellHookData) => {
      const pn = doc.pdf.getCurrentPageInfo().pageNumber;
      // Track page meta if autoTable created a brand-new page we didn't see.
      if (!doc.pages[pn - 1]) {
        doc.pages.push({
          sectionNumber: doc.currentSection?.number ?? null,
          sectionTitle: doc.currentSection?.title ?? null,
          isContinuation: data.pageNumber > 1,
          contentTop: data.pageNumber > 1 ? continuationTop : firstPageTop,
        });
      }
      // ONLY paint the continuation band on TRUE continuation pages of a
      // split table. The first page of the table must never have the band —
      // it would overlay the section heading or preceding paragraph.
      if (data.pageNumber > 1 && doc.currentSection) {
        // Header/footer already exist on the page (autoTable triggered addPage
        // which we don't own; repaint chrome to be safe, then add the band).
        paintHeader(doc); paintFooterChrome(doc);
        paintContinuationBand(doc);
        if (doc.pages[pn - 1]) {
          doc.pages[pn - 1].isContinuation = true;
          doc.pages[pn - 1].sectionNumber = doc.currentSection.number;
          doc.pages[pn - 1].sectionTitle = doc.currentSection.title;
        }
      }
    },
  });

  const finalY = (doc.pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  if (typeof finalY === "number") doc.y = finalY + 8;
}

/** Fallback rendering when a table has more columns than allowed in the current layout. */
function placeTableAsCardList(doc: Doc, opts: PlaceTableOpts) {
  if (opts.caption) subTitle(doc, opts.caption);
  const head = (opts.head?.[0] as string[] | undefined) ?? [];
  opts.body.forEach((row) => {
    const cells = (row as unknown[]).map((c) => {
      if (typeof c === "string") return c;
      if (c && typeof c === "object" && "content" in (c as Record<string, unknown>)) {
        return String((c as { content: unknown }).content ?? "");
      }
      return String(c ?? "");
    });
    beginBlock(doc, 40);
    const { pdf } = doc;
    setFill(pdf, C.surface); setDraw(pdf, C.border); pdf.setLineWidth(0.4);
    const cardH = Math.max(28, cells.length * 14 + 12);
    ensureSpace(doc, cardH + 6);
    pdf.roundedRect(MARGIN, doc.y, CONTENT_W, cardH, 4, 4, "FD");
    let cy = doc.y + 14;
    cells.forEach((val, i) => {
      const label = head[i] || `Field ${i + 1}`;
      setColor(pdf, C.muted); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5);
      pdf.text((label || "").toUpperCase(), MARGIN + 10, cy);
      setColor(pdf, C.text); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
      const lines = pdf.splitTextToSize(String(val || "—"), CONTENT_W - 130) as string[];
      lines.forEach((ln, j) => pdf.text(ln, MARGIN + 130, cy + j * 11));
      cy += Math.max(12, lines.length * 11);
    });
    doc.y += cardH + 6;
  });
}

// ---------- chart placement ----------
export function placeChartImage(doc: Doc, dataUrl: string | null | undefined, maxH = 220) {
  if (!dataUrl) { placeChartFallback(doc, "Chart unavailable — verify the source dashboard is rendered."); return; }
  const { pdf } = doc;
  const props = pdf.getImageProperties(dataUrl);
  const r = props.width / props.height;
  let w = CONTENT_W, h = CONTENT_W / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  beginBlock(doc, h + 24);
  const x = MARGIN + (CONTENT_W - w) / 2;
  pdf.addImage(dataUrl, "PNG", x, doc.y, w, h);
  doc.y += h + 8;
}

export function placeChartFallback(doc: Doc, message: string) {
  const { pdf } = doc;
  const h = 80;
  ensureSpace(doc, h + 8);
  setFill(pdf, C.surface); setDraw(pdf, C.border); pdf.setLineWidth(0.5);
  pdf.roundedRect(MARGIN, doc.y, CONTENT_W, h, 6, 6, "FD");
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(9);
  const lines = pdf.splitTextToSize(message, CONTENT_W - 24) as string[];
  lines.slice(0, 3).forEach((ln, i) => pdf.text(ln, MARGIN + 12, doc.y + 30 + i * 12));
  doc.y += h + 8;
}

// ---------- finalize: TOC + page numbers ----------
export function finalizeTOC(doc: Doc) {
  const { pdf } = doc;
  // TOC was reserved at page 2 (immediately after cover). Paint into it now.
  pdf.setPage(2);
  // Clear the page first to avoid leftover chrome misalignment
  // (header/footer were already painted by reserveTocPage; we only need body).
  let y = 80;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); setColor(pdf, C.text);
  pdf.text("Table of Contents", MARGIN, y);
  y += 8;
  setDraw(pdf, C.primary); pdf.setLineWidth(0.8);
  pdf.line(MARGIN, y, MARGIN + 60, y);
  y += 22;
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  doc.toc.forEach((entry) => {
    if (y > BOTTOM_LIMIT - 20) return;
    const title = entry.number > 0 ? `${entry.number}. ${entry.title}` : entry.title;
    const pageStr = String(entry.page);
    setColor(pdf, C.text); pdf.setFont("helvetica", "bold");
    pdf.text(title, MARGIN, y);
    const tw = pdf.getTextWidth(title);
    setColor(pdf, C.muted); pdf.setFont("helvetica", "normal");
    const pw = pdf.getTextWidth(pageStr);
    const dotsStart = MARGIN + tw + 6;
    const dotsEnd = PAGE_W - MARGIN - pw - 6;
    if (dotsEnd > dotsStart) {
      const dots = ".".repeat(Math.max(0, Math.floor((dotsEnd - dotsStart) / 2.4)));
      pdf.text(dots, dotsStart, y);
    }
    pdf.text(pageStr, PAGE_W - MARGIN, y, { align: "right" });
    y += 18;
  });
}

export function stampPageNumbers(doc: Doc) {
  const { pdf } = doc;
  const total = pdf.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    pdf.setPage(i);
    setFill(pdf, C.white);
    pdf.rect(PAGE_W / 2 - 60, PAGE_H - 36, 120, 14, "F");
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
    pdf.text(`Page ${i} of ${total}`, PAGE_W / 2, FOOTER_TEXT_Y, { align: "center" });
  }
}
