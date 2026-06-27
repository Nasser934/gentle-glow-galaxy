// =============================================================================
// Concept AI — PDF Exporter (Phase 1 orchestrator)
// -----------------------------------------------------------------------------
// Thin orchestrator on top of `src/lib/pdf/engine.ts` + templates.
// Phase 1 keeps the current content order; Phase 2 will rewrite the page order.
// =============================================================================

import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import {
  ensureEvidenceFields, sanitizeForConsumer, assessInputQuality,
  deriveAssumptionRegister, type AssumptionRow,
} from "@/lib/evidence";

import {
  createDoc, addFirstBodyPage, reserveTocPage, finalizeTOC, stampPageNumbers,
  startSection, subTitle, paragraph, bulletList, notice, placeTable,
  C, CONTENT_W,
} from "./pdf/engine";
import { captureActiveCharts } from "./pdf/chartRegistry";
import { drawCover } from "./pdf/templates/cover";
import { placeScorecard, resetScorecardGuards } from "./pdf/templates/scorecard";
import { placeChartCommentary } from "./pdf/templates/chartCommentary";
import { startAppendix, resetAppendixCounter } from "./pdf/templates/appendix";

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));

export interface VersionFamilyEntry {
  id: string;
  slug?: string | null;
  title?: string | null;
  created_at: string;
  isCurrent?: boolean;
}

export interface ExportPdfPayload {
  report: FeasibilityReport;
  inputs: ConceptInputs;
  versionFamily?: VersionFamilyEntry[];
}

/**
 * Primary entrypoint. Signature preserved for callers:
 *   exportReportToPdf(captureRootEl, fileName, { report, inputs, versionFamily? })
 *
 * `captureRootEl` is now used ONLY as the chart-capture root (offscreen mount),
 * not as a source of PDF content. Content is composed natively via engine.
 */
export async function exportReportToPdf(
  captureRootEl: HTMLElement | null,
  fileName: string,
  payload?: ExportPdfPayload,
) {
  await document.fonts?.ready;
  const data = payload ?? (window as never as { __pdfPayload?: unknown }).__pdfPayload;
  if (!data || typeof data !== "object" || !("report" in data) || !("inputs" in data))
    throw new Error("Missing report data for PDF export.");
  const { report: rawReport, inputs, versionFamily } = data as ExportPdfPayload;

  const report = ensureEvidenceFields(rawReport, inputs);
  const iq = assessInputQuality(inputs);

  // Reset per-export guards
  resetScorecardGuards();
  resetAppendixCounter();

  const doc = createDoc({
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
  });

  // -------- Page 1: Cover --------
  drawCover(doc.pdf, report, inputs);

  // -------- Page 2: TOC reserved --------
  reserveTocPage(doc);

  // -------- Page 3+: Body --------
  addFirstBodyPage(doc);

  // Capture currently active charts (3 today). Failure is non-fatal.
  const charts = await safeCapture(captureRootEl);

  /* 1. Executive Summary */
  startSection(doc, "Executive Summary");
  paragraph(doc, s(report.executiveSummary));

  const decision = report.decision;
  if (decision || report.scores.verdict) {
    const v = decision?.verdict || report.scores.verdict;
    const conf = decision?.overallConfidencePct;
    const lines = [
      `Verdict: ${s(v)}.`,
      decision?.nextStepHint ? `Next step — ${s(decision.nextStepHint)}.` : "",
      conf != null ? `Confidence: ${conf}%.` : "",
    ].filter(Boolean).join(" ");
    notice(doc, lines, "info");
  }

  /* 2. Decision Scorecard + FMART radar */
  placeScorecard(doc, report, charts["fmart-radar"] ?? null);

  /* 3. Why this score? */
  if (report.scoreExplanation?.length) {
    startSection(doc, "Why this score?");
    paragraph(
      doc,
      "What helped, what lowered, and the most useful next action per dimension.",
      { size: 9, italic: true, color: C.muted },
    );
    placeTable(doc, {
      head: [["Dimension", "Score", "Drivers / concerns", "Action"]],
      body: report.scoreExplanation.flatMap((r) => {
        const drivers = [
          ...(r.positiveDrivers || []).slice(0, 2).map((x) => `+ ${x}`),
          ...(r.negativeDrivers || []).slice(0, 2).map((x) => `– ${x}`),
        ].join(" · ");
        const main = [
          { content: s(r.label), styles: { fontStyle: "bold" as const } },
          { content: `${(r.score ?? 0).toFixed(1)}`, styles: { halign: "center" as const } },
          s(drivers),
          s((r.improvementActions || []).slice(0, 2).join(" · ")),
        ];
        const implication = r.decisionImplication
          ? [{
              content: `Implication: ${s(r.decisionImplication)}`,
              colSpan: 4,
              styles: { fillColor: C.softBlue, textColor: C.primaryDark, fontStyle: "italic" as const, fontSize: 8.5 },
            }]
          : null;
        return implication ? [main, implication] : [main];
      }),
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 44, halign: "center" },
        2: { cellWidth: 200 },
        3: { cellWidth: CONTENT_W - 110 - 44 - 200 },
      },
      styles: { fontSize: 8.8 },
    });
  }

  /* 4. Input Quality */
  startSection(doc, "Input Quality");
  const iqScore = report.inputQualityScore ?? iq.overall;
  const iqLabel = iqScore >= 80 ? "Strong" : iqScore >= 60 ? "Adequate" : iqScore >= 40 ? "Needs improvement" : "Weak";
  paragraph(doc, `Input quality score: ${iqScore} / 100 — ${iqLabel}.`, { size: 10 });
  notice(doc, "Stronger inputs improve confidence. They do not automatically increase the feasibility score.", "info");

  const missing = report.inputCompleteness?.missingFields ?? iq.missing;
  const weak    = report.inputCompleteness?.weakFields    ?? [...iq.weak, ...iq.needsImprovement];
  const contra  = report.inputCompleteness?.contradictoryFields ?? iq.contradictions;
  if (missing?.length) { subTitle(doc, "Missing fields"); bulletList(doc, missing.map(s)); }
  if (weak?.length)    { subTitle(doc, "Weak / needs improvement"); bulletList(doc, weak.map(s)); }
  if (contra?.length)  { subTitle(doc, "Possible contradictions"); bulletList(doc, contra.map(s)); }

  const fieldSuggestions = iq.fields.filter((f) => f.status !== "complete").slice(0, 8);
  if (fieldSuggestions.length) {
    subTitle(doc, "Top field-level suggestions");
    placeTable(doc, {
      head: [["Field", "Status", "Why it matters", "What to add"]],
      body: fieldSuggestions.map((f) => [s(f.label), s(f.status.replace("_", " ")), s(f.impact), s(f.suggestion)]),
      columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" }, 1: { cellWidth: 80 } },
      styles: { fontSize: 8.8 },
    });
  }

  /* 5. Evidence Mix */
  const mix = report.evidenceMix;
  if (mix) {
    startSection(doc, "Evidence Mix");
    notice(
      doc,
      `User input ${mix.userInputPercent}% · Web research ${mix.webResearchPercent}% · AI assumption ${mix.aiAssumptionPercent}%.`,
      mix.aiAssumptionPercent > 40 ? "warn" : "info",
    );
    notice(
      doc,
      mix.aiAssumptionPercent > 40
        ? "High AI assumption dependency — strengthen inputs and validate key assumptions before investment."
        : mix.aiAssumptionPercent > 30
          ? "Medium AI assumption dependency — validate the key assumptions in the register."
          : "Low AI assumption dependency — stronger confidence in the analysis.",
      mix.aiAssumptionPercent > 40 ? "warn" : "info",
    );
  }

  /* 6. Claim Evidence Map */
  if (report.claimEvidenceMap?.length) {
    startSection(doc, "Evidence behind this report");
    // 7-col table → falls back to card list inside placeTable (max 5 in main).
    placeTable(doc, {
      head: [["Claim", "Section", "Mix (U/W/AI)", "Conf.", "How to strengthen"]],
      body: report.claimEvidenceMap.map((c) => [
        s(c.claimText), s(c.reportSection),
        `${c.userInputPercent}/${c.webResearchPercent}/${c.aiAssumptionPercent}`,
        s(c.confidence), s(c.userCanImproveBy),
      ]),
      columnStyles: {
        0: { cellWidth: 170 },
        1: { cellWidth: 80 },
        2: { cellWidth: 60, halign: "center" },
        3: { cellWidth: 40, halign: "center" },
        4: { cellWidth: CONTENT_W - 350 },
      },
      styles: { fontSize: 8.5 },
    });
  }

  /* 7. Market */
  startSection(doc, "Market Analysis");
  subTitle(doc, "Market sizing (TAM · SAM · SOM)");
  placeTable(doc, {
    head: [["Tier", "Label", "Value", "CAGR"]],
    body: [
      ["TAM", s(report.market.tamLabel), s(report.market.tamValue), s(report.market.tamCagr)],
      ["SAM", s(report.market.samLabel), s(report.market.samValue), s(report.market.samCagr)],
      ["SOM", s(report.market.somLabel), s(report.market.somValue), s(report.market.somCagr)],
    ],
    styles: { fontSize: 9 },
  });

  placeChartCommentary(doc, {
    caption: "Market growth — TAM vs SAM",
    imageUrl: charts["market-growth"] ?? null,
    maxHeight: 200,
    fallbackMessage: "Market growth chart unavailable — verify dashboard rendered before exporting.",
  });

  subTitle(doc, "Customer profile");
  placeTable(doc, {
    body: [
      ["Age & location", s(report.customer.ageLocation)],
      ["Income", s(report.customer.income)],
      ["Goals", s(report.customer.goals)],
      ["Willingness to pay", s(report.customer.willingnessToPay)],
      ["Behavior", s(report.customer.behavior)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130, fillColor: C.surface } },
    styles: { fontSize: 9 },
  });

  /* 8. Competitive Landscape */
  if (report.competitors?.length) {
    startSection(doc, "Competitive Landscape");
    placeTable(doc, {
      head: [["Competitor", "Model", "Weakness", "Where they win"]],
      body: report.competitors.map((c) => [s(c.name), s(c.model), s(c.weakness), s(c.edge)]),
      columnStyles: {
        0: { cellWidth: 100, fontStyle: "bold" },
        1: { cellWidth: 110 },
        2: { cellWidth: 130 },
        3: { cellWidth: CONTENT_W - 340 },
      },
    });
  }

  /* 9. Market Research */
  if (report.research) {
    const r = report.research;
    startSection(doc, "Market Research & Signals");
    paragraph(doc, s(r.overview));
    placeTable(doc, {
      body: [["Confidence", s(r.confidence)], ["Sentiment", s(r.sentiment)]],
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 120, fillColor: C.surface } },
      styles: { fontSize: 9 },
    });
    if (r.keySignals?.length)         { subTitle(doc, "Key signals");         bulletList(doc, r.keySignals.map(s)); }
    if (r.painPoints?.length)         { subTitle(doc, "Pain points");         bulletList(doc, r.painPoints.map(s)); }
    if (r.competitorMentions?.length) { subTitle(doc, "Competitor mentions"); bulletList(doc, r.competitorMentions.map(s)); }
    if (r.redditSignals?.length)      { subTitle(doc, "Community signals");   bulletList(doc, r.redditSignals.map(s)); }
    if (r.webSignals?.length)         { subTitle(doc, "Web signals");         bulletList(doc, r.webSignals.map(s)); }
    if (r.citations?.length) {
      subTitle(doc, "Citations");
      placeTable(doc, {
        head: [["Source", "Title", "Takeaway"]],
        body: r.citations.slice(0, 8).map((c) => [s(c.source), s(c.title), s(c.takeaway)]),
        columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 170 }, 2: { cellWidth: CONTENT_W - 260 } },
        styles: { fontSize: 8.5 },
      });
    }
  }

  /* 10. Financial Plan */
  startSection(doc, "Financial Plan");
  const cur = report.financials.currency || "";
  subTitle(doc, `Startup costs (CapEx) — ${cur}`);
  placeTable(doc, {
    head: [["Category", "Low", "High", "Notes"]],
    body: [
      ...report.financials.capEx.map((c) => [
        s(c.category),
        c.low.toLocaleString("en-US"),
        c.high.toLocaleString("en-US"),
        s(c.notes),
      ]),
      [{
        content: "TOTAL",
        styles: { fontStyle: "bold" as const, fillColor: C.softBlue, textColor: C.primary },
      }, {
        content: report.financials.capExTotal.low.toLocaleString("en-US"),
        styles: { fontStyle: "bold" as const, fillColor: C.softBlue, textColor: C.primary, halign: "right" as const },
      }, {
        content: report.financials.capExTotal.high.toLocaleString("en-US"),
        styles: { fontStyle: "bold" as const, fillColor: C.softBlue, textColor: C.primary, halign: "right" as const },
      }, {
        content: `Mid: ${report.financials.capExTotal.mid.toLocaleString("en-US")}`,
        styles: { fontStyle: "bold" as const, fillColor: C.softBlue, textColor: C.primary },
      }],
    ],
    columnStyles: {
      0: { cellWidth: 150, fontStyle: "bold" },
      1: { cellWidth: 70, halign: "right" },
      2: { cellWidth: 70, halign: "right" },
      3: { cellWidth: CONTENT_W - 290 },
    },
  });

  placeChartCommentary(doc, {
    caption: "CapEx breakdown",
    imageUrl: charts["capex-breakdown"] ?? null,
    maxHeight: 200,
    fallbackMessage: "CapEx chart unavailable — verify dashboard rendered before exporting.",
  });

  subTitle(doc, `Monthly operating costs — ${cur}`);
  placeTable(doc, {
    head: [["Category", "Monthly", "Annual"]],
    body: report.financials.opEx.map((o) => [
      s(o.category),
      o.monthly.toLocaleString("en-US"),
      o.annual.toLocaleString("en-US"),
    ]),
    columnStyles: {
      0: { cellWidth: CONTENT_W - 200, fontStyle: "bold" },
      1: { cellWidth: 100, halign: "right" },
      2: { cellWidth: 100, halign: "right" },
    },
  });

  subTitle(doc, "Revenue scenarios");
  placeTable(doc, {
    head: [["Scenario", "Probability", "Customers / Yr 1", "Annual revenue", "Break-even"]],
    body: report.financials.scenarios.map((sc) => [
      s(sc.scenario), s(sc.probability), s(sc.subscribersYr1), s(sc.annualRevenue), s(sc.breakEven),
    ]),
    styles: { fontSize: 9 },
  });
  if (report.financials.ltvCacRatio) {
    paragraph(doc, `LTV / CAC ratio (base case): ${s(report.financials.ltvCacRatio)}`, { italic: true });
  }

  /* 11. Risk Assessment */
  if (report.risks?.length) {
    startSection(doc, "Risk Assessment");
    placeTable(doc, {
      head: [["Risk", "Prob.", "Impact", "Level", "Mitigation"]],
      body: report.risks.map((r) => [s(r.name), s(r.probability), s(r.impact), s(r.level), s(r.mitigation)]),
      columnStyles: {
        0: { cellWidth: 140, fontStyle: "bold" },
        1: { cellWidth: 50, halign: "center" },
        2: { cellWidth: 50, halign: "center" },
        3: { cellWidth: 50, halign: "center" },
        4: { cellWidth: CONTENT_W - 290 },
      },
    });
  }

  /* 12. Funding Mix */
  if (report.fundingMix?.length) {
    startSection(doc, "Funding Mix");
    placeTable(doc, {
      head: [["Source", "Share", `Amount (${cur})`, "Rationale"]],
      body: report.fundingMix.map((f) => [s(f.source), s(f.share), s(f.amount), s(f.rationale)]),
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold" },
        1: { cellWidth: 60 },
        2: { cellWidth: 100 },
        3: { cellWidth: CONTENT_W - 280 },
      },
    });
    if (report.fundingAdvisory) notice(doc, `Advisory — ${s(report.fundingAdvisory)}`, "warn");
  }

  /* 13. Strategic Recommendations + Next Steps */
  if (report.recommendations?.length) {
    startSection(doc, "Strategic Recommendations");
    bulletList(doc, report.recommendations.map(s));
  }
  if (report.nextSteps?.length) {
    startSection(doc, "Next Steps");
    bulletList(doc, report.nextSteps.map(s), { numbered: true });
  }

  /* Appendix A — Project Brief */
  startAppendix(doc, "Project Brief");
  placeTable(doc, {
    body: [
      ["Project name", s(inputs.projectName)],
      ["Industry", s(inputs.industry)],
      ["Location", s(inputs.location)],
      ["Description", s(inputs.description)],
      ["Strategic objectives", s(inputs.strategicObjectives)],
      ["Business model", s(inputs.businessModel)],
      ["Revenue model", s(inputs.revenueModel)],
      ["Founder experience", s(inputs.founderExperience)],
      ["Budget range", s(inputs.budgetRange)],
      ["Timeline", s(inputs.timeline)],
      ["Team size", s(inputs.teamSize)],
      ["Dependencies", s(inputs.dependencies)],
      ["Assumptions", s(inputs.assumptions)],
      ["Constraints", s(inputs.constraints)],
      ["Success factors", s(inputs.successFactors)],
      ["Known risks", s(inputs.knownRisks)],
      ["Regulatory considerations", s(inputs.regulatoryConsiderations)],
      ["Technology readiness", s(inputs.technologyReadiness)],
    ].filter((row) => (row[1] || "").trim().length > 0),
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 150, fillColor: C.surface } },
    styles: { fontSize: 9 },
  });

  /* Appendix B — Assumption Register */
  const register: AssumptionRow[] = deriveAssumptionRegister(report, inputs);
  if (register.length) {
    startAppendix(doc, "Assumption Register");
    placeTable(doc, {
      head: [["Assumption", "Source", "Confidence", "Risk if wrong", "What to add"]],
      body: register.slice(0, 20).map((r) => [
        s(r.assumption), s(r.sourceType), s(r.confidence), s(r.riskIfWrong), s(r.whatToAdd),
      ]),
      columnStyles: {
        0: { cellWidth: 160, fontStyle: "bold" },
        1: { cellWidth: 70 },
        2: { cellWidth: 60, halign: "center" },
        3: { cellWidth: 100 },
        4: { cellWidth: CONTENT_W - 390 },
      },
      styles: { fontSize: 8.8 },
    });
  }

  /* Appendix C — Methodology */
  startAppendix(doc, "Methodology");
  paragraph(doc, s(report.methodology) || "Weighted multi-dimensional analysis (FMART) with grounded research signals.");
  const weights = report.scores.weights;
  if (weights) {
    placeTable(doc, {
      head: [["Dimension", "Weight"]],
      body: [
        ["Financial", `${Math.round((weights.financial || 0) * 100)}%`],
        ["Market", `${Math.round((weights.market || 0) * 100)}%`],
        ["Achievability", `${Math.round((weights.achievability || 0) * 100)}%`],
        ["Risk (inverse)", `${Math.round((weights.risk || 0) * 100)}%`],
        ["Timing", `${Math.round((weights.timing || 0) * 100)}%`],
        ["Operational", `${Math.round((weights.operational || 0) * 100)}%`],
      ],
      columnStyles: { 0: { cellWidth: 200, fontStyle: "bold" }, 1: { cellWidth: 80, halign: "center" } },
      styles: { fontSize: 9 },
    });
  }
  paragraph(doc, "Verdict thresholds: ≥ 7.5 PROCEED · 6.0–7.4 PROCEED WITH CAUTION · 4.5–5.9 REVISE · < 4.5 DO NOT PROCEED.", { size: 9, italic: true, color: C.muted });

  /* Appendix D — Version History (only if data exists) */
  if (versionFamily && versionFamily.length > 1) {
    startAppendix(doc, "Version History");
    placeTable(doc, {
      head: [["Version", "Date", "Title"]],
      body: versionFamily.map((v, i) => [
        v.isCurrent ? `v${i + 1} (current)` : `v${i + 1}`,
        new Date(v.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
        s(v.title || ""),
      ]),
      styles: { fontSize: 9 },
    });
  }

  // -------- Finalize: TOC + page numbers --------
  finalizeTOC(doc);
  stampPageNumbers(doc);

  // Save
  doc.pdf.save(fileName);
  return { fileName };
}

/** Defensive chart capture — never throws to the caller. */
async function safeCapture(rootEl: HTMLElement | null) {
  try { return await captureActiveCharts(rootEl); }
  catch (e) { console.warn("[pdf] chart capture failed:", e); return {}; }
}
