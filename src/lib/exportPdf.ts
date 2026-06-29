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
  buildExportDecisionPack, applyCanonicalToReport,
  type ExportDecisionPack,
} from "@/lib/exportDecisionPack";

import {
  createDoc, addFirstBodyPage, reserveTocPage, finalizeTOC, stampPageNumbers,
  startSection, subTitle, paragraph, bulletList, notice, placeTable,
  drawKpiGrid, placeChartImage, type KpiItem,
  C, CONTENT_W, MARGIN, ensureSpace, reserveBlock,
} from "./pdf/engine";
import { captureActiveCharts } from "./pdf/chartRegistry";
import { drawCover, conciseBreakEvenSub } from "./pdf/templates/cover";
import { resetScorecardGuards } from "./pdf/templates/scorecard";
import { placeChartCommentary } from "./pdf/templates/chartCommentary";
import { startAppendix, resetAppendixCounter } from "./pdf/templates/appendix";
import { placeExecutiveMemo } from "./pdf/templates/memo";
import {
  deriveMemoSections, deriveLegacyFinancialSummary, deriveValidationItems,
  deriveRoadmap, deriveDecisionDrivers, bucketAssumption, inferCitationConfidence,
  deriveExecutiveSummary,
} from "./pdf/derive";
import { projectLabels } from "./pdf/project";
import { cleanCitations } from "./pdf/citations";

const s = (v: unknown): string => sanitizeForConsumer(v == null ? "" : String(v));

/** Strip duplicated lead-ins like "Break-even occurs around Break-even is projected…". */
const cleanAssumptionText = (text: string): string =>
  (text || "")
    .replace(/Break-even occurs around\s+Break-even is projected/gi, "Break-even is projected")
    .replace(/\b(\w[\w\s-]{3,40}?)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** Compact a break-even/payback string for KPI cards (e.g. "Month 20"). */
function shortBE(raw: string | undefined): string {
  const t = s(raw || "").trim();
  if (!t) return "";
  const m = t.match(/(month\s*\d+|m\d+|year\s*\d+|y\d+|q[1-4]\s*y?\d*)/i);
  if (m) return m[0].replace(/\s+/g, " ").replace(/^(\w)/, (c) => c.toUpperCase());
  const head = t.split(/[,.;:(]| based| by| with/i)[0].trim();
  return head.length > 28 ? head.slice(0, 26) + "…" : head;
}

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

  const baseReport = ensureEvidenceFields(rawReport, inputs);
  // Canonical export pack — single source of truth for verdict, break-even,
  // investment range and risk counts across PDF/PPTX/XLSX.
  const pack: ExportDecisionPack = buildExportDecisionPack(baseReport, inputs, { versionFamily });
  const report = applyCanonicalToReport(baseReport, pack);
  const iq = assessInputQuality(inputs);

  resetScorecardGuards();
  resetAppendixCounter();

  const doc = createDoc({
    projectName: inputs.projectName || "Untitled",
    reportId: report.reportId,
  });

  /* ---------- Page 1: Cover ---------- */
  drawCover(doc.pdf, report, inputs, pack);

  /* ---------- Page 2: TOC reserved ---------- */
  reserveTocPage(doc);

  /* ---------- Page 3+: Body ---------- */
  addFirstBodyPage(doc);

  const charts = await safeCapture(captureRootEl);
  const decision = report.decision;
  const mix = report.evidenceMix;

  /* ===== 1. Executive Summary (narrative) ===== */
  startSection(doc, "Executive Summary");
  paragraph(
    doc,
    "A short narrative for executives who want context before reading the memo. The bullets that follow in the Decision Memo summarise the same view in scannable form.",
    { size: 9, italic: true, color: C.muted, gap: 8 },
  );
  for (const para of deriveExecutiveSummary(report, inputs)) {
    paragraph(doc, para, { size: 10, gap: 8 });
  }

  /* ===== 2. Executive Decision Memo ===== */
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
    { label: "Decision confidence", value: pack.score.decisionConfidencePct != null ? `${pack.score.decisionConfidencePct}%` : "Requires validation", sub: mix ? `AI assumptions ${mix.aiAssumptionPercent}%` : undefined },
    { label: "Investment Range", value: pack.financial.investmentRange, sub: report.financials.currency || undefined },
    labels.isInternal
      ? { label: "Payback / Break-even", value: pack.financial.breakEvenDisplay, sub: conciseBreakEvenSub(pack.financial.breakEvenDisplay, pack.financial.breakEvenRange) }
      : { label: "Break-even", value: pack.financial.breakEvenDisplay, sub: conciseBreakEvenSub(pack.financial.breakEvenDisplay, pack.financial.breakEvenRange) ?? (pack.financial.ltvCac && pack.financial.ltvCac !== "—" ? `LTV:CAC ${pack.financial.ltvCac}` : undefined) },
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
  const DIM_NAME: Record<string, string> = {
    financial: "Financial", market: "Market", achievability: "Achievability",
    risk: "Risk", timing: "Timing", operational: "Operational",
  };
  placeTable(doc, {
    head: [["Dimension", "Score", "Driver", "Concern", "Action"]],
    body: sx.slice(0, 6).map((r) => {
      const pos = (r.positiveDrivers || []).filter(Boolean)[0] || findingByDim[r.dimension] || "—";
      const neg = (r.negativeDrivers || []).filter((x) => x && !/no specific issues/i.test(x))[0] || "—";
      const act = (r.improvementActions || []).filter(Boolean)[0] || "—";
      const dimName = DIM_NAME[String(r.dimension || "").toLowerCase()] || s(r.label);
      // Prepend the descriptive label (if different) to the driver text so we don't lose it.
      const lbl = s(r.label).trim();
      const driver = lbl && lbl.toLowerCase() !== dimName.toLowerCase()
        ? `${lbl} — ${s(pos)}`
        : s(pos);
      return [
        { content: dimName, styles: { fontStyle: "bold" as const } },
        { content: `${(r.score ?? 0).toFixed(1)}`, styles: { halign: "center" as const } },
        driver,
        s(neg),
        s(act),
      ];
    }),
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 36, halign: "center" },
      2: { cellWidth: 140 },
      3: { cellWidth: 110 },
      4: { cellWidth: CONTENT_W - 80 - 36 - 140 - 110 },
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
        { label: "Investment Range", value: pack.financial.investmentRange },
        { label: "Break-even", value: pack.financial.breakEvenDisplay, sub: conciseBreakEvenSub(pack.financial.breakEvenDisplay, pack.financial.breakEvenRange) },
        { label: "CapEx (Mid)", value: pack.financial.capexMid },
        { label: "Monthly OpEx", value: pack.financial.monthlyOpex },
        { label: "Initial Funding Need", value: pack.financial.initialFundingNeed, sub: "CapEx + 6mo OpEx" },
        { label: "Top financial risks", value: legacy.topFinancialRisks.length ? `${legacy.topFinancialRisks.length} tracked` : "Requires validation" },
      ]
    : [
        { label: "Investment Range", value: pack.financial.investmentRange },
        { label: "Break-even", value: pack.financial.breakEvenDisplay, sub: pack.financial.breakEvenRange && pack.financial.breakEvenRange !== pack.financial.breakEvenDisplay ? pack.financial.breakEvenRange : undefined },
        { label: "LTV:CAC", value: pack.financial.ltvCac },
        { label: "CapEx (Mid)", value: pack.financial.capexMid },
        { label: "Monthly OpEx", value: pack.financial.monthlyOpex },
        { label: "Initial Funding Need", value: pack.financial.initialFundingNeed, sub: "CapEx + 6mo OpEx" },
      ];
  doc.y = drawKpiGrid(doc.pdf, MARGIN, doc.y, CONTENT_W, finKpis, { cols: 3, rowH: 62, gap: 10 }) + 14;

  // Short interpretation narrative — keeps the section from feeling like only cards + tables.
  const finInterp: string[] = labels.isInternal
    ? [
        `Investment range ${s(report.financials.investmentRange) || "Requires validation"} reflects the platform CapEx envelope; payback is driven by converting manual reporting effort, duplicated tooling, and governance risk into measurable cost avoidance.`,
        "The base case is conditional on adoption across priority departments — it should be validated with current labor cost, license cost, and data-processing effort benchmarks.",
        "Key financial assumptions to validate: baseline cost per process, expected hours saved, and the share of OpEx that can realistically be redirected.",
      ]
    : [
        `Investment range ${s(report.financials.investmentRange) || "Requires validation"} sizes the funding ask; break-even depends on customer ramp, pricing, and the cost-to-acquire holding to plan.`,
        "The base case is conditional on the unit-economics — validate pricing, churn, and CAC payback before committing.",
        "Key financial assumptions to validate: pricing tiers, gross margin, and the conversion curve from pilot to paying customer.",
      ];
  bulletList(doc, finInterp, { size: 9.5 });

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
    const highCount = pack.risk.highRiskCount;
    const materialCount = pack.risk.materialRiskCount;
    if (highCount > 0) {
      notice(
        doc,
        `${highCount} high-severity risk${highCount > 1 ? "s" : ""} require explicit mitigation review before funding approval.`,
        "warn",
      );
    } else if (materialCount > 0) {
      notice(
        doc,
        `${materialCount} material risk${materialCount > 1 ? "s" : ""} require mitigation review.`,
        "info",
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

  // Always present a complete 30 / 60 / 90 plan, even when data is sparse.
  const roadmap = deriveRoadmap(report, inputs);
  const windows: Array<"Next 30 days" | "Days 31 – 60" | "Days 61 – 90"> = [
    "Next 30 days", "Days 31 – 60", "Days 61 – 90",
  ];
  // Force section break — roadmap should breathe after the validations table.
  reserveBlock(doc, 200);
  subTitle(doc, "30 / 60 / 90 day plan");
  windows.forEach((w) => {
    subTitle(doc, w);
    const phase = roadmap.find((p) => p.window === w);
    const items = phase?.items?.length
      ? phase.items
      : ["Define owner, evidence and success criteria for this window."];
    bulletList(doc, items);
  });

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

  // Top claims with canonical claim IDs + readable source domains.
  const topClaims = pack.evidence.topClaims;
  const claimsRaw = report.claimEvidenceMap || [];
  if (topClaims.length) {
    subTitle(doc, "Top claims and their evidence");
    placeTable(doc, {
      head: [["ID", "Claim", "Confidence", "Source(s)", "How to strengthen"]],
      body: topClaims.map((c, idx) => {
        const raw = claimsRaw[idx];
        const sourcesText = c.sources.length
          ? c.sources.map((src) => src.domain || src.title).filter(Boolean).slice(0, 2).join(", ")
          : "—";
        return [
          { content: c.claimId, styles: { fontStyle: "bold" as const, halign: "center" as const } },
          s(c.claimText),
          s(c.confidence),
          sourcesText,
          s(raw?.userCanImproveBy || ""),
        ];
      }),
      columnStyles: {
        0: { cellWidth: 40, halign: "center", fontStyle: "bold" },
        1: { cellWidth: 170 },
        2: { cellWidth: 56, halign: "center" },
        3: { cellWidth: 100 },
        4: { cellWidth: CONTENT_W - 40 - 170 - 56 - 100 },
      },
      styles: { fontSize: 8.6, cellPadding: 6 },
    });
  }

  // Curated citations — cap to top 4 to keep the table breathable.
  const curated = cleanCitations(report.research?.citations as unknown[] | undefined, 4);
  if (curated.length) {
    subTitle(doc, "Top curated sources");
    placeTable(doc, {
      head: [["Source", "Title", "Takeaway", "Conf."]],
      body: curated.map((c) => [
        { content: s(c.source), styles: { fontStyle: "bold" as const } },
        s(c.title),
        s(c.takeaway),
        inferCitationConfidence(c),
      ]),
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 130 },
        2: { cellWidth: CONTENT_W - 100 - 130 - 50 },
        3: { cellWidth: 50, halign: "center" },
      },
      styles: { fontSize: 8.6, cellPadding: 6 },
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

  /* Appendix B — Assumption Register (grouped, balanced page splits) */
  const register: AssumptionRow[] = deriveAssumptionRegister(report, inputs);
  if (register.length) {
    startAppendix(doc, "Assumption Register");
    paragraph(
      doc,
      "Assumptions are grouped by domain. Internal-project assumptions use savings / payback metrics rather than SaaS LTV : CAC.",
      { size: 9, italic: true, color: C.muted, gap: 8 },
    );
    const groups = new Map<string, AssumptionRow[]>();
    register.forEach((a) => {
      const g = bucketAssumption(`${a.assumption} ${a.riskIfWrong || ""}`);
      // Drop LTV/CAC-only assumptions when this is an internal project.
      if (labels.isInternal && /\b(ltv|cac|churn|arr|mrr|subscriber)\b/i.test(a.assumption) && !/saving|payback|department|workflow/i.test(a.assumption)) return;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(a);
    });
    const order = ["Market", "Financial", "Operational", "Risk / Compliance"];
    order.forEach((g) => {
      const rows = groups.get(g);
      if (!rows || !rows.length) return;
      // Keep the whole group together when possible: ~26pt per row + heading.
      const capped = rows.slice(0, 8);
      reserveBlock(doc, Math.min(560, 60 + capped.length * 34));
      subTitle(doc, g);
      placeTable(doc, {
        head: [["Assumption", "Source", "Conf.", "Risk if wrong", "What to add"]],
        body: capped.map((r) => [
          cleanAssumptionText(s(r.assumption)),
          s(r.sourceType),
          s(r.confidence),
          cleanAssumptionText(s(r.riskIfWrong)),
          cleanAssumptionText(s(r.whatToAdd)),
        ]),
        columnStyles: {
          0: { cellWidth: 150, fontStyle: "bold" },
          1: { cellWidth: 60, halign: "center" },
          2: { cellWidth: 44, halign: "center" },
          3: { cellWidth: 110 },
          4: { cellWidth: CONTENT_W - 364 },
        },
        styles: { fontSize: 8.6, cellPadding: 6 },
      });
    });
  }

  /* Appendix C — Methodology */
  startAppendix(doc, "Methodology");
  paragraph(doc, "FMART-O 6-Dimension Weighted Scoring", { size: 11, color: C.muted, gap: 8 });
  // Always render our canonical copy; ignore any stale "FMART Framework — 5-Dimension" string from older reports.
  paragraph(
    doc,
    "FMART-O blends user inputs, web research and analyst-style synthesis across six dimensions. The 'O' is Operational feasibility — added to the traditional FMART (Financial, Market, Achievability, Risk, Timing) framework so cross-functional execution risk is scored explicitly.",
  );
  const weights = report.scores.weights;
  if (weights) {
    subTitle(doc, "FMART-O weights");
    placeTable(doc, {
      head: [["Dimension", "Weight"]],
      body: [
        ["Financial",     `${Math.round((weights.financial || 0) * 100)}%`],
        ["Market",        `${Math.round((weights.market || 0) * 100)}%`],
        ["Achievability", `${Math.round((weights.achievability || 0) * 100)}%`],
        ["Risk (inverse)",`${Math.round((weights.risk || 0) * 100)}%`],
        ["Timing",        `${Math.round((weights.timing || 0) * 100)}%`],
        ["Operational",   `${Math.round((weights.operational || 0) * 100)}%`],
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
  bulletList(doc, [
    ">= 7.5 — Proceed",
    "6.0 – 7.4 — Proceed with Caution",
    "4.5 – 5.9 — Revise",
    "< 4.5 — Do Not Proceed",
  ]);
  paragraph(
    doc,
    "This methodology is intended to support structured feasibility judgment, not replace financial, legal or technical due diligence.",
    { size: 9, italic: true, color: C.muted, gap: 4 },
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
  // Reserve heading + chart together so the heading is never stranded.
  reserveBlock(doc, 230);
  subTitle(doc, "FMART-O 6-Dimension Radar");
  placeChartImage(doc, fmartRadarUrl, 200);
}


async function safeCapture(rootEl: HTMLElement | null) {
  try { return await captureActiveCharts(rootEl); }
  catch (e) { console.warn("[pdf] chart capture failed:", e); return {}; }
}
