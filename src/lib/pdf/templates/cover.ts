// =============================================================================
// Phase 1 — Cover template
// Investment-memo cover: brand band, title, verdict pill, KPI grid (no-clip),
// data provenance bar. NEVER truncates the BREAK-EVEN KPI.
// =============================================================================
import type jsPDF from "jspdf";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import {
  C, MARGIN, PAGE_W, PAGE_H, CONTENT_W, setColor, setFill, setDraw,
  drawKpiGrid, type KpiItem, type RGB,
} from "../engine";
import { deriveDecisionDrivers, deriveDecisionBlockers } from "../derive";
import { projectLabels } from "../project";
import { sanitizeForConsumer } from "@/lib/evidence";

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));

/** Trim to a single short bullet (≤ ~90 chars), one sentence — guarantees 2-line fit in cover cards. */
function trimBullets(items: string[], max: number): string[] {
  return (items || []).slice(0, max).map((it) => {
    const first = (it || "").split(/(?<=[.!?])\s/)[0] || it;
    return first.length > 90 ? first.slice(0, 87).trimEnd() + "…" : first;
  }).filter(Boolean);
}

/** Extract a compact break-even value, e.g. "Month 20". Strips trailing clauses. */
function shortenBreakEven(raw: string | undefined): string {
  const t = s(raw).trim();
  if (!t) return "";
  const m = t.match(/(month\s*\d+|m\d+|year\s*\d+|y\d+|q[1-4]\s*y?\d*)/i);
  if (m) return m[0].replace(/\s+/g, " ").replace(/^(\w)/, (c) => c.toUpperCase());
  // Sentence start clause up to first delimiter
  const head = t.split(/[,.;:(]| based| by| with/i)[0].trim();
  return head.length > 28 ? head.slice(0, 26) + "…" : head;
}

function shortenPayback(raw: string | undefined): string {
  return shortenBreakEven(raw);
}

function confidenceBand(pct: number): string {
  if (pct >= 75) return "High";
  if (pct >= 55) return "Medium";
  return "Low — strengthen inputs";
}

const verdictColor = (v: string): RGB => {
  const u = (v || "").toUpperCase();
  if (u === "PROCEED") return C.success;
  if (u.startsWith("CONDITIONAL") || u === "PROCEED WITH CAUTION" || u === "IMPROVE INPUTS BEFORE INVESTMENT DECISION")
    return C.warning;
  if (u === "REVISE") return [234, 88, 12];
  return C.destructive;
};

function cleanRecommendationLabel(verdict: string, label: string): string {
  const v = (verdict || "").trim();
  const l = (label || "").trim();
  if (!l || !v) return l;
  if (l.toUpperCase() === v.toUpperCase()) return "";
  const tokens = v.split(/\s+/);
  let stripped = l;
  for (const t of tokens) {
    const re = new RegExp("^" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,:.;—-]+", "i");
    if (re.test(stripped)) stripped = stripped.replace(re, "");
  }
  stripped = stripped.replace(/^[\s,:.;—-]+/, "").trim();
  if (!stripped || stripped.toUpperCase() === v.toUpperCase()) return "";
  return stripped;
}

function provenanceBar(
  pdf: jsPDF, x: number, y: number, width: number, height: number,
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

export function drawCover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs) {
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
  pdf.text("CONCEPT AI", MARGIN, 44);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9);
  pdf.text("Confidential Strategic Analysis", MARGIN, 60);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  pdf.text(`Report ${report.reportId}`, PAGE_W - MARGIN, 44, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text(report.dateIssued || "", PAGE_W - MARGIN, 60, { align: "right" });

  // Title block
  let y = 140;
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9.5);
  pdf.text("FEASIBILITY REPORT", MARGIN, y);
  y += 26;
  setColor(pdf, C.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(26);
  const titleLines = pdf.splitTextToSize(inputs.projectName || "Untitled Project", CONTENT_W) as string[];
  titleLines.slice(0, 2).forEach((ln) => { pdf.text(ln, MARGIN, y); y += 30; });

  if (inputs.location || inputs.industry) {
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
    pdf.text([inputs.industry, inputs.location].filter(Boolean).join(" · "), MARGIN, y);
    y += 16;
  }

  // Verdict pill + clean tail
  y += 12;
  const vColor = verdictColor(verdictText);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
  const pillTxt = verdictText || "—";
  const vw = pdf.getTextWidth(pillTxt) + 24;
  setFill(pdf, vColor);
  pdf.roundedRect(MARGIN, y, vw, 22, 4, 4, "F");
  setColor(pdf, C.white);
  pdf.text(pillTxt, MARGIN + 12, y + 15);
  if (recoTail) {
    setColor(pdf, C.text);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(recoTail, MARGIN + vw + 12, y + 15);
  }
  y += 32;

  // Next step
  if (decision?.nextStepHint) {
    setColor(pdf, C.muted);
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(9.5);
    const ns = pdf.splitTextToSize(`Next step — ${decision.nextStepHint}`, CONTENT_W) as string[];
    ns.slice(0, 2).forEach((ln) => { pdf.text(ln, MARGIN, y); y += 12; });
    y += 4;
  }

  // 4-up KPI grid (no-clip, shrink-to-fit). One row = clear visual hierarchy.
  const labels = projectLabels(inputs);
  const beValue = shortenBreakEven(report.financials.breakEvenSummary);
  const fourth = labels.isInternal
    ? { label: "Payback / Validation", value: shortenPayback(report.financials.breakEvenSummary) || "Requires validation", sub: "Operational savings" }
    : { label: "Investment range", value: s(report.financials.investmentRange) || "Requires validation", sub: report.financials.currency || undefined };

  const kpis: KpiItem[] = [
    { label: "Overall score", value: `${(report.scores.overall ?? 0).toFixed(1)} / 10`, sub: "FMART-O weighted" },
    { label: "Decision confidence", value: confidencePct ? `${confidencePct}%` : "Requires validation", sub: confidencePct ? confidenceBand(confidencePct) : undefined },
    labels.isInternal
      ? { label: "Investment range", value: s(report.financials.investmentRange) || "Requires validation", sub: report.financials.currency || undefined }
      : { label: "Break-even (base)", value: beValue || "Requires validation", sub: beValue ? "See Financial Feasibility" : undefined },
    fourth,
  ];
  y = drawKpiGrid(pdf, MARGIN, y, CONTENT_W, kpis, { cols: 4, rowH: 70, gap: 10 });
  y += 22;

  // Two-column drivers / blockers cards
  const drivers = trimBullets(deriveDecisionDrivers(report, inputs), 3);
  const blockers = trimBullets(
    decision?.blockers?.length ? decision.blockers.slice(0, 3).map(String) : deriveDecisionBlockers(report, inputs),
    3,
  );

  if (drivers.length || blockers.length) {
    const colW = (CONTENT_W - 16) / 2;
    const cardH = 124;
    // Left card — drivers
    setFill(pdf, [240, 253, 244]); setDraw(pdf, [187, 247, 208]); pdf.setLineWidth(0.6);
    pdf.roundedRect(MARGIN, y, colW, cardH, 6, 6, "FD");
    setColor(pdf, C.success);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
    pdf.text("WHY THIS CAN WORK", MARGIN + 10, y + 16);
    pdf.setFont("helvetica", "normal"); setColor(pdf, C.text); pdf.setFontSize(9);
    let ly = y + 30;
    drivers.forEach((d) => {
      const lines = pdf.splitTextToSize(`• ${d}`, colW - 20) as string[];
      lines.slice(0, 2).forEach((ln) => { if (ly < y + cardH - 6) { pdf.text(ln, MARGIN + 10, ly); ly += 12; } });
      ly += 2;
    });
    // Right card — blockers
    const rx = MARGIN + colW + 16;
    setFill(pdf, [255, 247, 237]); setDraw(pdf, [254, 215, 170]); pdf.setLineWidth(0.6);
    pdf.roundedRect(rx, y, colW, cardH, 6, 6, "FD");
    setColor(pdf, C.warnText);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
    pdf.text("WHAT MUST BE VALIDATED", rx + 10, y + 16);
    pdf.setFont("helvetica", "normal"); setColor(pdf, C.text); pdf.setFontSize(9);
    let ry = y + 30;
    blockers.forEach((b) => {
      const lines = pdf.splitTextToSize(`• ${b}`, colW - 20) as string[];
      lines.slice(0, 2).forEach((ln) => { if (ry < y + cardH - 6) { pdf.text(ln, rx + 10, ry); ry += 12; } });
      ry += 2;
    });
    y += cardH + 14;
  }



  // Provenance
  setColor(pdf, C.text);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("DATA PROVENANCE", MARGIN, y);
  y += 10;
  if (mix) y = provenanceBar(pdf, MARGIN, y, CONTENT_W, 12, mix);
  setColor(pdf, C.muted);
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(8);
  pdf.text(
    "AI assumption <30%: stronger confidence  ·  30–40%: validate key inputs  ·  >40%: exploratory — strengthen before decision.",
    MARGIN, y,
  );
  y += 10;

  if (mix && mix.aiAssumptionPercent > 40) {
    y += 4;
    setFill(pdf, C.softWarn); setDraw(pdf, C.warning); pdf.setLineWidth(0.6);
    const txt = "High AI assumption dependency — validate key assumptions in the register before any investment or launch decision.";
    const lines = pdf.splitTextToSize(txt, CONTENT_W - 14) as string[];
    const wh = lines.length * 11 + 10;
    pdf.roundedRect(MARGIN, y, CONTENT_W, wh, 4, 4, "FD");
    setColor(pdf, C.warnText);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5);
    lines.forEach((ln, i) => pdf.text(ln, MARGIN + 8, y + 13 + i * 11));
  }

  // Footer band
  setFill(pdf, C.primary);
  pdf.rect(0, PAGE_H - 44, PAGE_W, 44, "F");
  setColor(pdf, C.white);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5);
  pdf.text("Auto-generated by AI. Not financial or legal advice.", MARGIN, PAGE_H - 22);
  pdf.setFont("helvetica", "bold");
  pdf.text("CONCEPT AI", PAGE_W - MARGIN, PAGE_H - 22, { align: "right" });
}
