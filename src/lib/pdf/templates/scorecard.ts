// Phase 1 — Scorecard template: FMART table + radar, with single-radar guard.
import type { FeasibilityReport } from "@/types/analysis";
import { type Doc, C, CONTENT_W, startSection, subTitle, placeTable, placeChartImage } from "../engine";

// Module-level guard: ensures the FMART radar is rendered at most once per export.
let radarPlaced = false;
export function resetScorecardGuards() { radarPlaced = false; }

export function placeScorecard(
  doc: Doc,
  report: FeasibilityReport,
  fmartRadarUrl: string | null,
) {
  startSection(doc, "Decision Scorecard");

  placeTable(doc, {
    head: [["Dimension", "Score", "Key Finding"]],
    body: [
      ["Financial Feasibility",   `${report.scores.financial.toFixed(1)} / 10`,    report.scores.financialFinding ?? ""],
      ["Market Attractiveness",   `${report.scores.market.toFixed(1)} / 10`,       report.scores.marketFinding ?? ""],
      ["Technical Achievability", `${report.scores.achievability.toFixed(1)} / 10`, report.scores.achievabilityFinding ?? ""],
      ["Operational Feasibility", `${report.scores.operational.toFixed(1)} / 10`,   report.scores.operationalFinding ?? ""],
      ["Risk Level (inverse)",    `${report.scores.risk.toFixed(1)} / 10`,         report.scores.riskFinding ?? ""],
      ["Market Timing",           `${report.scores.timing.toFixed(1)} / 10`,       report.scores.timingFinding ?? ""],
    ],
    columnStyles: {
      0: { cellWidth: 140 },
      1: { cellWidth: 70, halign: "center" },
      2: { cellWidth: CONTENT_W - 210 },
    },
    styles: { fontSize: 9 },
  });

  if (!radarPlaced && fmartRadarUrl) {
    subTitle(doc, "FMART-O 6-Dimension Radar");
    placeChartImage(doc, fmartRadarUrl, 220);
    radarPlaced = true;
  } else if (!fmartRadarUrl) {
    subTitle(doc, "FMART-O 6-Dimension Radar");
    // Fallback: small KV summary of the six scores so the page isn't blank.
    placeTable(doc, {
      head: [["Dimension", "Score"]],
      body: [
        ["Financial", `${report.scores.financial.toFixed(1)}`],
        ["Market", `${report.scores.market.toFixed(1)}`],
        ["Achievability", `${report.scores.achievability.toFixed(1)}`],
        ["Risk (inv.)", `${report.scores.risk.toFixed(1)}`],
        ["Timing", `${report.scores.timing.toFixed(1)}`],
        ["Operational", `${report.scores.operational.toFixed(1)}`],
      ],
      columnStyles: { 0: { cellWidth: 180, fontStyle: "bold" }, 1: { cellWidth: 80, halign: "center" } },
      styles: { fontSize: 9 },
    });
  }

  // Avoid "unused warning" on C in some configurations:
  void C;
}
