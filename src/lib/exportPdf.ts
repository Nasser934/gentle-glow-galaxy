// =============================================================================
// Concept AI — PDF Exporter (Phase 2 orchestrator)
// -----------------------------------------------------------------------------
// Phase 2 — Executive memo structure. Page order:
//   1.  Cover (investment memo + drivers + blockers)
//   2.  TOC (reserved page 2)
//   3.  Executive Decision Memo
//   4.  Investment Snapshot
//   5.  Feasibility Scorecard (compact)
//   6.  Financial Feasibility (legacy summary — promoted forward)
//   7.  Market & Customer
//   8.  Competition & Positioning
//   9.  Risk & Mitigation
//   10. Validation Roadmap (formerly Input Quality)
//   11. Evidence & Source Quality (citations cleaned + capped)
//   App A — Project Brief (grouped)
//   App B — Assumption Register (grouped)
//   App C — Methodology
//   App D — Version History (conditional)
// =============================================================================

import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import {
  ensureEvidenceFields, sanitizeForConsumer, assessInputQuality,
  deriveAssumptionRegister, type AssumptionRow,
} from "@/lib/evidence";

import {
  createDoc, addFirstBodyPage, reserveTocPage, finalizeTOC, stampPageNumbers,
  startSection, subTitle, paragraph, bulletList, notice, placeTable,
  drawKpiGrid, placeChartImage, type KpiItem,
  C, CONTENT_W, MARGIN, ensureSpace, reserveBlock,
} from "./pdf/engine";
import { captureActiveCharts } from "./pdf/chartRegistry";
import { drawCover } from "./pdf/templates/cover";
import { resetScorecardGuards } from "./pdf/templates/scorecard";
import { placeChartCommentary } from "./pdf/templates/chartCommentary";
import { startAppendix, resetAppendixCounter } from "./pdf/templates/appendix";
import { placeExecutiveMemo } from "./pdf/templates/memo";
import {
  deriveMemoSections, deriveLegacyFinancialSummary, deriveValidationItems,
  deriveRoadmap, deriveDecisionDrivers, bucketAssumption, inferCitationConfidence,
} from "./pdf/derive";
import { projectLabels } from "./pdf/project";
import { cleanCitations } from "./pdf/citations";

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

  resetScorecardGuards();
  resetAppendixCounter();

  const doc = createDoc({
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
  });

  /* ---------- Page 1: Cover ---------- */
  drawCover(doc.pdf, report, inputs);

  /* ---------- Page 2: TOC reserved ---------- */
  reserveTocPage(doc);

  /* ---------- Page 3+: Body ---------- */
  addFirstBodyPage(doc);

  const charts = await safeCapture(captureRootEl);
  const decision = report.decision;
  const mix = report.evidenceMix;

  /* ===== 1. Executive Decision Memo ===== */
  startSection(doc, "Executive Decision Memo");
  placeExecutiveMemo(doc, deriveMemoSections(report, inputs));

  /* ===== 2. Investment Snapshot ===== */
  startSection(doc, "Investment Snapshot");
  paragraph(
    doc,
    "Decision-grade KPIs at a glance. Values labelled \"Requires validation\" need stakeholder confirmation before commitment.",
    { size: 9, italic: true, color: C.muted },
  );
  const labels = projectLabels(inputs);
  const snapshotKpis: KpiItem[] = [
    { label: "Overall score", value: `${(report.scores.overall ?? 0).toFixed(1)} / 10`, sub: "FMART-O weighted" },
    { label: "Decision confidence", value: decision?.overallConfidencePct != null ? `${decision.overallConfidencePct}%` : "Requires validation", sub: mix ? `AI assumptions ${mix.aiAssumptionPercent}%` : undefined },
    { label: "Investment range", value: s(report.financials.investmentRange) || "Requires validation", sub: report.financials.currency || undefined },
    labels.isInternal
      ? { label: "Payback / Break-even", value: s(report.financials.breakEvenSummary) || "Requires validation", sub: "Based on operational savings" }
      : { label: "Break-even (base)", value: s(report.financials.breakEvenSummary) || "Requires validation", sub: report.financials.ltvCacRatio ? `LTV : CAC ${s(report.financials.ltvCacRatio)}` : undefined },
  ];
  reserveBlock(doc, 200);
  doc.y = drawKpiGrid(doc.pdf, MARGIN, doc.y, CONTENT_W, snapshotKpis, { cols: 4, rowH: 70, gap: 10 }) + 18;

  if (mix) {
    const mixNote =
      mix.aiAssumptionPercent > 40
        ? "High AI assumption dependency. Strengthen inputs and validate key assumptions before investment."
        : mix.aiAssumptionPercent > 30
          ? "Medium AI assumption dependency. Validate the key assumptions in the appendix register."
          : "Low AI assumption dependency. Stronger confidence in the analysis.";
    notice(doc, `Evidence mix — User input ${mix.userInputPercent}% · Web research ${mix.webResearchPercent}% · AI assumption ${mix.aiAssumptionPercent}%. ${mixNote}`, mix.aiAssumptionPercent > 40 ? "warn" : "info");
  }

  /* ===== 3. Feasibility Scorecard ===== */
  // Compact scorecard: Dimension / Score / Driver / Concern / Action (5 cols).
  startSection(doc, "Feasibility Scorecard");
  const sx = report.scoreExplanation || [];
  const findingByDim: Record<string, string> = {
    financial: report.scores.financialFinding,
    market: report.scores.marketFinding,
    achievability: report.scores.achievabilityFinding,
    operational: report.scores.operationalFinding,
    risk: report.scores.riskFinding,
    timing: report.scores.timingFinding,
  };
  placeTable(doc, {
    head: [["Dimension", "Score", "Driver", "Concern", "Action"]],
    body: sx.slice(0, 6).map((r) => {
      const pos = (r.positiveDrivers || []).filter(Boolean)[0] || findingByDim[r.dimension] || "—";
      const neg = (r.negativeDrivers || []).filter((x) => x && !/no specific issues/i.test(x))[0] || "—";
      const act = (r.improvementActions || []).filter(Boolean)[0] || "—";
      return [
        { content: s(r.label), styles: { fontStyle: "bold" as const } },
        { content: `${(r.score ?? 0).toFixed(1)}`, styles: { halign: "center" as const } },
        s(pos),
        s(neg),
        s(act),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 36, halign: "center" },
      2: { cellWidth: 130 },
      3: { cellWidth: 110 },
      4: { cellWidth: CONTENT_W - 90 - 36 - 130 - 110 },
    },
    styles: { fontSize: 8.8 },
  });

  // FMART-O radar (single instance, guarded)
  placeScorecardRadarOnly(doc, report, charts["fmart-radar"] ?? null);

  /* ===== 4. Financial Feasibility ===== */
  startSection(doc, "Financial Feasibility");
  // Keep intro + KPI grid + first table together — don't strand the heading.
  reserveBlock(doc, 330);
  notice(
    doc,
    "The summary below reflects the current feasibility estimate. A detailed financial model should be validated with project-specific operating assumptions before funding approval.",
    "info",
  );

  const legacy = deriveLegacyFinancialSummary(report);
  const finKpis: KpiItem[] = labels.isInternal
    ? [
        { label: "Investment range", value: legacy.investmentRange },
        { label: "Break-even / Payback", value: legacy.breakEven },
        { label: "CapEx (mid)", value: legacy.capExMid },
        { label: "OpEx", value: legacy.opExMonthly },
        { label: "Top financial risks", value: legacy.topFinancialRisks.length ? `${legacy.topFinancialRisks.length} tracked` : "Requires validation" },
        { label: "Internal ROI", value: "See base case", sub: "Annual savings × Year 1" },
      ]
    : [
        { label: "Investment range", value: legacy.investmentRange },
        { label: "Break-even (base)", value: legacy.breakEven },
        { label: "LTV : CAC", value: legacy.ltvCac },
        { label: "CapEx (mid)", value: legacy.capExMid },
        { label: "OpEx", value: legacy.opExMonthly },
        { label: "Top financial risks", value: legacy.topFinancialRisks.length ? `${legacy.topFinancialRisks.length} tracked` : "Requires validation" },
      ];
  doc.y = drawKpiGrid(doc.pdf, MARGIN, doc.y, CONTENT_W, finKpis, { cols: 3, rowH: 62, gap: 10 }) + 14;

  // Revenue / Savings scenarios — compact 5-col
  if (report.financials.scenarios?.length) {
    subTitle(doc, labels.isInternal ? "Savings scenarios" : "Revenue scenarios");
    placeTable(doc, {
      head: [["Scenario", "Probability", labels.customersYr1Label, labels.annualRevenueLabel, "Break-even"]],
      body: report.financials.scenarios.map((sc) => [
        s(sc.scenario), s(sc.probability), s(sc.subscribersYr1), s(sc.annualRevenue), s(sc.breakEven),
      ]),
      styles: { fontSize: 9 },
    });
  }


  // CapEx chart commentary if captured
  if (charts["capex-breakdown"]) {
    placeChartCommentary(doc, {
      caption: "CapEx breakdown",
      imageUrl: charts["capex-breakdown"],
      maxHeight: 180,
    });
  }

  // Funding mix folded in
  if (report.fundingMix?.length) {
    subTitle(doc, "Funding mix");
    placeTable(doc, {
      head: [["Source", "Share", `Amount (${report.financials.currency || ""})`, "Rationale"]],
      body: report.fundingMix.map((f) => [s(f.source), s(f.share), s(f.amount), s(f.rationale)]),
      columnStyles: {
        0: { cellWidth: 120, fontStyle: "bold" },
        1: { cellWidth: 50, halign: "center" },
        2: { cellWidth: 90 },
        3: { cellWidth: CONTENT_W - 260 },
      },
      styles: { fontSize: 9 },
    });
    if (report.fundingAdvisory) notice(doc, `Advisory — ${s(report.fundingAdvisory)}`, "warn");
  }

  if (legacy.topFinancialRisks.length) {
    subTitle(doc, "Top financial risks / validation gaps");
    bulletList(doc, legacy.topFinancialRisks);
  }

  /* ===== 5. Market & Customer ===== */
  startSection(doc, "Market & Customer");
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

  if (charts["market-growth"]) {
    placeChartCommentary(doc, {
      caption: "Market growth — TAM vs SAM",
      imageUrl: charts["market-growth"],
      maxHeight: 180,
      interpretation: report.market.tamCagr
        ? `TAM growing at ${s(report.market.tamCagr)}; SAM expansion at ${s(report.market.samCagr) || "—"}.`
        : undefined,
    });
  }

  subTitle(doc, "Target customer");
  placeTable(doc, {
    body: [
      ["Profile", s(report.customer.ageLocation)],
      ["Income", s(report.customer.income)],
      ["Goals", s(report.customer.goals)],
      ["Willingness to pay", s(report.customer.willingnessToPay)],
      ["Behavior", s(report.customer.behavior)],
    ],
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 130, fillColor: C.surface } },
    styles: { fontSize: 9 },
  });

  if (report.research) {
    const r = report.research;
    if (r.keySignals?.length) {
      subTitle(doc, "Demand signals");
      bulletList(doc, r.keySignals.slice(0, 4).map(s));
    }
    if (r.painPoints?.length) {
      subTitle(doc, "Pain points");
      bulletList(doc, r.painPoints.slice(0, 4).map(s));
    }
    if (r.overview) {
      paragraph(doc, s(r.overview), { size: 9, italic: true, color: C.muted });
    }
  }

  /* ===== 6. Competition & Positioning ===== */
  if (report.competitors?.length) {
    startSection(doc, "Competition & Positioning");
    placeTable(doc, {
      head: [["Competitor", "Model", "Weakness", "Where they win"]],
      body: report.competitors.map((c) => [s(c.name), s(c.model), s(c.weakness), s(c.edge)]),
      columnStyles: {
        0: { cellWidth: 110, fontStyle: "bold" },
        1: { cellWidth: 100 },
        2: { cellWidth: 130 },
        3: { cellWidth: CONTENT_W - 340 },
      },
      styles: { fontSize: 8.8 },
    });

    const drivers = deriveDecisionDrivers(report, inputs);
    if (drivers.length) {
      subTitle(doc, "Where this project can win");
      bulletList(doc, drivers);
    }
    const exposures = (report.risks || [])
      .filter((rk) => /market|competit|adoption|differentiat/i.test(rk.name))
      .slice(0, 3)
      .map((rk) => `${s(rk.name)} — ${s(rk.mitigation) || "needs mitigation."}`);
    if (exposures.length) {
      subTitle(doc, "Where this project is exposed");
      bulletList(doc, exposures);
    }
  }

  /* ===== 7. Risk & Mitigation ===== */
  if (report.risks?.length) {
    startSection(doc, "Risk & Mitigation");
    const critical = report.risks.filter((r) => /high|critical/i.test(`${r.level} ${r.impact}`));
    if (critical.length) {
      notice(
        doc,
        `${critical.length} high-severity risk${critical.length > 1 ? "s" : ""} require explicit mitigation review before funding approval.`,
        "warn",
      );
    }
    placeTable(doc, {
      head: [["Risk", "Prob.", "Impact", "Severity", "Mitigation"]],
      body: report.risks.map((r) => [
        { content: s(r.name), styles: { fontStyle: "bold" as const } },
        s(r.probability),
        s(r.impact),
        s(r.level),
        s(r.mitigation),
      ]),
      columnStyles: {
        0: { cellWidth: 140 },
        1: { cellWidth: 46, halign: "center" },
        2: { cellWidth: 46, halign: "center" },
        3: { cellWidth: 56, halign: "center" },
        4: { cellWidth: CONTENT_W - 288 },
      },
      styles: { fontSize: 8.8 },
    });
  }

  /* ===== 8. Validation Roadmap ===== */
  startSection(doc, "Validation Roadmap");
  paragraph(
    doc,
    "What must be validated before funding or launch. Each item lists the assumption it strengthens, the evidence to collect, and the expected impact on decision confidence.",
    { size: 9.5 },
  );
  const iqScore = report.inputQualityScore ?? iq.overall;
  const iqLabel = iqScore >= 80 ? "Strong" : iqScore >= 60 ? "Adequate" : iqScore >= 40 ? "Needs improvement" : "Weak";
  notice(doc, `Input quality: ${iqScore} / 100 — ${iqLabel}. Stronger inputs improve confidence; they do not automatically increase the feasibility score.`, "info");

  const validations = deriveValidationItems(report, inputs);
  if (validations.length) {
    placeTable(doc, {
      head: [["What to validate", "Strengthens", "Evidence to collect", "Impact"]],
      body: validations.map((v) => [
        { content: s(v.what), styles: { fontStyle: "bold" as const } },
        s(v.strengthens),
        s(v.evidence),
        s(v.impact),
      ]),
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 130 },
        2: { cellWidth: CONTENT_W - 130 - 130 - 96 },
        3: { cellWidth: 96 },
      },
      styles: { fontSize: 8.8 },
    });
  }

  const roadmap = deriveRoadmap(report);
  if (roadmap.length) {
    subTitle(doc, "30 / 60 / 90 day plan");
    roadmap.forEach((p) => {
      subTitle(doc, p.window);
      bulletList(doc, p.items);
    });
  }

  /* ===== 9. Evidence & Source Quality ===== */
  startSection(doc, "Evidence & Source Quality");

  if (mix) {
    paragraph(
      doc,
      `Evidence mix — User input ${mix.userInputPercent}% · Web research ${mix.webResearchPercent}% · AI assumption ${mix.aiAssumptionPercent}%.`,
      { size: 9.5 },
    );
    if (mix.aiAssumptionPercent > 40) {
      notice(doc, "High AI assumption dependency. Strengthen inputs and validate key assumptions before any investment or launch decision.", "warn");
    }
  }

  // Top claims (max 5)
  const claims = (report.claimEvidenceMap || []).slice(0, 5);
  if (claims.length) {
    subTitle(doc, "Top claims and their evidence");
    placeTable(doc, {
      head: [["Claim", "Mix (U/W/AI)", "Confidence", "How to strengthen"]],
      body: claims.map((c) => [
        { content: s(c.claimText), styles: { fontStyle: "bold" as const } },
        `${c.userInputPercent}/${c.webResearchPercent}/${c.aiAssumptionPercent}`,
        s(c.confidence),
        s(c.userCanImproveBy),
      ]),
      columnStyles: {
        0: { cellWidth: 200 },
        1: { cellWidth: 70, halign: "center" },
        2: { cellWidth: 60, halign: "center" },
        3: { cellWidth: CONTENT_W - 330 },
      },
      styles: { fontSize: 8.8 },
    });
  }

  // Curated citations (cleaned + capped)
  const curated = cleanCitations(report.research?.citations as unknown[] | undefined, 7);
  if (curated.length) {
    subTitle(doc, "Top curated sources");
    placeTable(doc, {
      head: [["Source", "Title", "Takeaway", "Confidence"]],
      body: curated.map((c) => [
        { content: s(c.source), styles: { fontStyle: "bold" as const } },
        s(c.title),
        s(c.takeaway),
        s(c.confidence || "—"),
      ]),
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 140 },
        2: { cellWidth: CONTENT_W - 90 - 140 - 60 },
        3: { cellWidth: 60, halign: "center" },
      },
      styles: { fontSize: 8.5 },
    });
    paragraph(
      doc,
      `${curated.length} curated source${curated.length > 1 ? "s" : ""} shown. Full source list is available in the supplementary export.`,
      { size: 8.5, italic: true, color: C.muted },
    );
  } else {
    notice(doc, "No curated external sources met the quality threshold. Add competitor URLs or analyst citations to strengthen the evidence base.", "info");
  }

  /* ===================== APPENDICES ===================== */

  /* Appendix A — Project Brief (grouped) */
  startAppendix(doc, "Project Brief");
  const briefGroup = (label: string, rows: Array<[string, string | undefined]>) => {
    const filtered = rows.filter((r) => (r[1] || "").trim().length > 0);
    if (!filtered.length) return;
    subTitle(doc, label);
    placeTable(doc, {
      body: filtered.map(([k, v]) => [k, s(v)]),
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 150, fillColor: C.surface } },
      styles: { fontSize: 9 },
    });
  };
  briefGroup("Concept", [
    ["Project name", inputs.projectName],
    ["Industry", inputs.industry],
    ["Location", inputs.location],
    ["Description", inputs.description],
    ["Strategic objectives", inputs.strategicObjectives],
  ]);
  briefGroup("Market", [
    ["Business model", inputs.businessModel],
    ["Revenue model", inputs.revenueModel],
    ["Competitors", inputs.competitorUrls],
  ]);
  briefGroup("Resources", [
    ["Budget range", inputs.budgetRange],
    ["Timeline", inputs.timeline],
    ["Team size", inputs.teamSize],
    ["Founder experience", inputs.founderExperience],
    ["Dependencies", inputs.dependencies],
    ["Technology readiness", inputs.technologyReadiness],
  ]);
  briefGroup("Risks", [
    ["Known risks", inputs.knownRisks],
    ["Regulatory considerations", inputs.regulatoryConsiderations],
    ["Constraints", inputs.constraints],
  ]);
  briefGroup("Assumptions", [
    ["Assumptions", inputs.assumptions],
    ["Success factors", inputs.successFactors],
  ]);

  /* Appendix B — Assumption Register (grouped) */
  const register: AssumptionRow[] = deriveAssumptionRegister(report, inputs);
  if (register.length) {
    startAppendix(doc, "Assumption Register");
    const bucket = (a: AssumptionRow): string => {
      const t = `${a.assumption} ${a.riskIfWrong || ""}`.toLowerCase();
      if (/market|tam|sam|demand|competitor|growth/.test(t)) return "Market";
      if (/financ|revenue|cost|capex|opex|payback|ltv|cac|budget|funding|cash/.test(t)) return "Financial";
      if (/operation|team|hiring|process|throughput|adoption|delivery/.test(t)) return "Operational";
      if (/risk|complian|regulator|legal|security|privacy|safety/.test(t)) return "Risk / Compliance";
      return "Operational";
    };
    const groups = new Map<string, AssumptionRow[]>();
    register.forEach((a) => {
      const g = bucket(a);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(a);
    });
    const order = ["Market", "Financial", "Operational", "Risk / Compliance"];
    order.forEach((g) => {
      const rows = groups.get(g);
      if (!rows || !rows.length) return;
      subTitle(doc, g);
      placeTable(doc, {
        head: [["Assumption", "Source", "Confidence", "Risk if wrong", "What to add"]],
        body: rows.slice(0, 12).map((r) => [
          s(r.assumption), s(r.sourceType), s(r.confidence), s(r.riskIfWrong), s(r.whatToAdd),
        ]),
        columnStyles: {
          0: { cellWidth: 150, fontStyle: "bold" },
          1: { cellWidth: 60, halign: "center" },
          2: { cellWidth: 56, halign: "center" },
          3: { cellWidth: 110 },
          4: { cellWidth: CONTENT_W - 376 },
        },
        styles: { fontSize: 8.6 },
      });
    });
  }

  /* Appendix C — Methodology (short) */
  startAppendix(doc, "Methodology");
  paragraph(doc, s(report.methodology) || "FMART 6-Dimension Weighted Scoring with grounded research synthesis.");
  const weights = report.scores.weights;
  if (weights) {
    subTitle(doc, "FMART weights");
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
  subTitle(doc, "Confidence definitions");
  bulletList(doc, [
    "High — multiple independent sources or direct evidence.",
    "Medium — at least one strong source or analogous benchmark.",
    "Low — primarily AI assumption; requires validation.",
  ]);
  subTitle(doc, "Recommendation thresholds");
  paragraph(
    doc,
    "Verdict thresholds: ≥ 7.5 PROCEED · 6.0 – 7.4 PROCEED WITH CAUTION · 4.5 – 5.9 REVISE · < 4.5 DO NOT PROCEED.",
    { size: 9, italic: true, color: C.muted },
  );

  /* Appendix D — Version History (conditional) */
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

  /* ---------- Finalize ---------- */
  finalizeTOC(doc);
  stampPageNumbers(doc);
  doc.pdf.save(fileName);
  return { fileName };
}

/* ----------------------------- helpers ------------------------------------- */

/** Lightweight radar-only placement for the Scorecard section. */
function placeScorecardRadarOnly(
  doc: ReturnType<typeof createDoc>,
  _report: FeasibilityReport,
  fmartRadarUrl: string | null,
) {
  if (!fmartRadarUrl) return;
  subTitle(doc, "FMART 6-Dimension Radar");
  placeChartImage(doc, fmartRadarUrl, 200);
}


async function safeCapture(rootEl: HTMLElement | null) {
  try { return await captureActiveCharts(rootEl); }
  catch (e) { console.warn("[pdf] chart capture failed:", e); return {}; }
}
