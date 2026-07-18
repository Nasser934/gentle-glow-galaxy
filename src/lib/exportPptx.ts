// =============================================================================
// Concept AI — PowerPoint Executive Deck (v2)
// -----------------------------------------------------------------------------
// 10-slide executive committee deck. All values come from the canonical
// ExportDecisionPack so PDF / PPTX / XLSX never disagree on verdict,
// break-even, financials, risk counts, or evidence claim IDs.
// =============================================================================

import pptxgen from "pptxgenjs";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import {
  buildExportDecisionPack,
  applyCanonicalToReport,
  type CanonicalVerdict,
} from "@/lib/exportDecisionPack";
import { isInternalProject } from "@/lib/format";

const COLORS = {
  primary: "1F4ED8",
  primaryDark: "0E2A6B",
  text: "0F172A",
  muted: "64748B",
  card: "F8FAFC",
  border: "E2E8F0",
  success: "10B981",
  warning: "F59E0B",
  danger: "EF4444",
  white: "FFFFFF",
};

const verdictColor = (v: CanonicalVerdict): string => {
  if (v === "Proceed") return COLORS.success;
  if (v === "Do Not Proceed") return COLORS.danger;
  return COLORS.warning; // Proceed with Caution + Revise
};

const truncate = (s: string, n: number) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

export function buildReportPresentation(
  rawReport: FeasibilityReport,
  inputs: ConceptInputs,
) {
  const pack = buildExportDecisionPack(rawReport, inputs);
  const report = applyCanonicalToReport(rawReport, pack);
  const internal = isInternalProject(report, inputs);

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = `${inputs.projectName} — Feasibility Report`;
  pptx.author = "Concept AI";

  const W = 13.33;
  const H = 7.5;

  /* --------------------------- shared chrome --------------------------- */
  const chrome = (s: pptxgen.Slide, title: string, subtitle?: string) => {
    s.background = { color: COLORS.white };
    s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: COLORS.primary }, line: { color: COLORS.primary } });
    s.addText(title, { x: 0.5, y: 0.25, w: 12, h: 0.6, fontSize: 26, bold: true, color: COLORS.text, fontFace: "Arial" });
    if (subtitle) s.addText(subtitle, { x: 0.5, y: 0.85, w: 12, h: 0.4, fontSize: 13, color: COLORS.muted, fontFace: "Arial" });
    s.addText(
      `${inputs.projectName} · Concept AI · Confidential`,
      { x: 0.5, y: H - 0.35, w: 12, h: 0.3, fontSize: 9, color: COLORS.muted, fontFace: "Arial" },
    );
  };

  const kpiCard = (
    s: pptxgen.Slide,
    x: number, y: number, w: number, h: number,
    label: string, value: string, sub?: string,
  ) => {
    s.addShape("roundRect", {
      x, y, w, h,
      fill: { color: COLORS.card },
      line: { color: COLORS.border },
      rectRadius: 0.08,
    });
    s.addText(label.toUpperCase(), {
      x: x + 0.18, y: y + 0.12, w: w - 0.36, h: 0.32,
      fontSize: 10, bold: true, color: COLORS.muted, charSpacing: 2, fontFace: "Arial",
    });
    s.addText(value || "—", {
      x: x + 0.18, y: y + 0.46, w: w - 0.36, h: 0.7,
      fontSize: 18, bold: true, color: COLORS.primary, fontFace: "Arial",
    });
    if (sub) {
      s.addText(sub, {
        x: x + 0.18, y: y + h - 0.4, w: w - 0.36, h: 0.32,
        fontSize: 10, color: COLORS.muted, fontFace: "Arial",
      });
    }
  };

  /* ============================ Slide 1 — Title / Verdict ============================ */
  const s1 = pptx.addSlide();
  s1.background = { color: COLORS.primaryDark };
  s1.addShape("rect", { x: 0, y: 0, w: W, h: 1.2, fill: { color: COLORS.primary } });
  s1.addText("CONCEPT AI · FEASIBILITY REPORT", {
    x: 0.6, y: 0.35, w: 12, h: 0.5, fontSize: 12, bold: true, color: COLORS.white, fontFace: "Arial", charSpacing: 4,
  });
  s1.addText(inputs.projectName || "Untitled Project", {
    x: 0.6, y: 1.8, w: 12, h: 1.4, fontSize: 44, bold: true, color: COLORS.white, fontFace: "Arial",
  });
  s1.addText(
    `${inputs.industry || ""}${inputs.location ? "  ·  " + inputs.location : ""}`,
    { x: 0.6, y: 3.2, w: 12, h: 0.5, fontSize: 18, color: "CADCFC", fontFace: "Arial" },
  );

  // Verdict pill
  const vColor = verdictColor(pack.verdict.canonical);
  s1.addShape("roundRect", {
    x: 0.6, y: 4.2, w: 5, h: 0.75,
    fill: { color: vColor }, line: { color: vColor }, rectRadius: 0.1,
  });
  s1.addText(pack.verdict.canonical, {
    x: 0.6, y: 4.2, w: 5, h: 0.75, fontSize: 18, bold: true, color: COLORS.white,
    align: "center", valign: "middle", fontFace: "Arial",
  });

  s1.addText(`Overall score  ${pack.score.overall.toFixed(1)} / 10`, {
    x: 5.9, y: 4.2, w: 7, h: 0.4, fontSize: 16, bold: true, color: COLORS.white, valign: "middle", fontFace: "Arial",
  });
  s1.addText(
    pack.score.decisionConfidencePct != null
      ? `Model-estimated confidence  ${pack.score.decisionConfidencePct}%`
      : "Model-estimated confidence  —",
    { x: 5.9, y: 4.6, w: 7, h: 0.4, fontSize: 14, color: "CADCFC", valign: "middle", fontFace: "Arial" },
  );

  s1.addText(
    `Report ID ${pack.identity.reportId}   ·   ${pack.identity.date}`,
    { x: 0.6, y: 6.7, w: 12, h: 0.4, fontSize: 11, color: "94A3B8", fontFace: "Arial" },
  );

  /* ============================ Slide 2 — Executive Decision ============================ */
  const s2 = pptx.addSlide();
  chrome(s2, "Executive Decision", pack.verdict.canonical);

  // ----- Left column: structured key points (NOT a giant paragraph) -----
  const recommendation =
    pack.verdict.canonical === "Proceed"
      ? "Move forward with disciplined execution. Lock in named owners for each validation item before kickoff."
      : pack.verdict.canonical === "Proceed with Caution"
        ? "Conditional go. Validate the items in the next page before committing full funding."
        : pack.verdict.canonical === "Revise"
          ? "Strengthen the inputs and assumptions before re-running this analysis."
          : "Do not proceed with the current evidence level. Re-scope the concept or improve evidence first.";

  const topRiskName = pack.risk.topRisks[0]?.name || (report.risks?.[0]?.name) || "Validate top assumptions";
  const requiredValidation =
    (report.nextSteps && report.nextSteps[0]) ||
    (report.recommendations && report.recommendations[0]) ||
    "Build a focused validation plan for the highest-impact assumptions.";

  const why = (report.scoreExplanation || [])
    .flatMap((r) => r.positiveDrivers || [])
    .filter(Boolean)[0] ||
    "Positive FMART-O signal supports moving into validation.";

  const leftBlocks: Array<[string, string]> = [
    ["Recommendation", recommendation],
    ["Why now", why],
    ["Main risk", topRiskName],
    ["Required validation", requiredValidation],
  ];

  leftBlocks.forEach(([label, body], i) => {
    const y = 1.45 + i * 1.25;
    s2.addText(label.toUpperCase(), {
      x: 0.5, y, w: 8.0, h: 0.3, fontSize: 11, bold: true, color: COLORS.primary,
      charSpacing: 2, fontFace: "Arial",
    });
    s2.addText(truncate(body, 240), {
      x: 0.5, y: y + 0.3, w: 8.0, h: 0.85, fontSize: 13, color: COLORS.text, fontFace: "Arial", valign: "top",
    });
  });

  // ----- Right column: KPI cards -----
  const colX = 8.95;
  const cardW = 3.9;
  const cardH = 1.25;
  kpiCard(s2, colX, 1.45, cardW, cardH, "Overall Score", `${pack.score.overall.toFixed(1)} / 10`);
  kpiCard(
    s2, colX, 2.78, cardW, cardH, "Model-estimated Confidence",
    pack.score.decisionConfidencePct != null ? `${pack.score.decisionConfidencePct}%` : "—",
    pack.score.confidenceLabel,
  );
  kpiCard(s2, colX, 4.11, cardW, cardH, "Investment Range", pack.financial.investmentRange);
  kpiCard(s2, colX, 5.44, cardW, cardH, "Break-even", pack.financial.breakEvenDisplay);

  /* ============================ Slide 3 — Why This Can Work ============================ */
  const s3 = pptx.addSlide();
  chrome(s3, "Why This Can Work", "Top drivers supporting the recommendation");

  const sxAll = report.scoreExplanation || [];
  const drivers = sxAll
    .map((r) => ({
      dim: r.label || r.dimension,
      driver: (r.positiveDrivers || []).filter(Boolean)[0] || "",
      score: r.score,
    }))
    .filter((d) => d.driver)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);

  // Pad to 3 cards if fewer drivers exist
  while (drivers.length < 3) {
    drivers.push({
      dim: ["Strategic fit", "Execution path", "Market readiness"][drivers.length] || "Driver",
      driver: "Validate this driver with stakeholder evidence to convert it into a hard commitment.",
      score: 0,
    });
  }

  const cardWidth = 4.0;
  const cardGap = 0.3;
  const startX = (W - (cardWidth * 3 + cardGap * 2)) / 2;
  drivers.forEach((d, i) => {
    const x = startX + i * (cardWidth + cardGap);
    s3.addShape("roundRect", {
      x, y: 1.7, w: cardWidth, h: 4.8,
      fill: { color: COLORS.card }, line: { color: COLORS.border }, rectRadius: 0.1,
    });
    s3.addText(`Driver ${i + 1}`, {
      x: x + 0.25, y: 1.9, w: cardWidth - 0.5, h: 0.35,
      fontSize: 10, bold: true, color: COLORS.muted, charSpacing: 2, fontFace: "Arial",
    });
    s3.addText(truncate(d.dim, 40), {
      x: x + 0.25, y: 2.25, w: cardWidth - 0.5, h: 0.55,
      fontSize: 17, bold: true, color: COLORS.primary, fontFace: "Arial",
    });
    s3.addText(truncate(d.driver, 240), {
      x: x + 0.25, y: 2.95, w: cardWidth - 0.5, h: 2.6,
      fontSize: 12, color: COLORS.text, fontFace: "Arial", valign: "top",
    });
    s3.addText(`FMART-O · ${truncate(d.dim, 24)}`, {
      x: x + 0.25, y: 6.05, w: cardWidth - 0.5, h: 0.3,
      fontSize: 10, italic: true, color: COLORS.muted, fontFace: "Arial",
    });
  });

  /* ============================ Slide 4 — What Must Be Validated ============================ */
  const s4 = pptx.addSlide();
  chrome(s4, "What Must Be Validated", "Evidence required before funding approval");

  type V = { what: string; evidence: string; impact: string };
  const validations: V[] = [];
  // Source 1: high-risk rows
  (report.risks || [])
    .filter((r) => /high|critical/i.test(r.level))
    .slice(0, 3)
    .forEach((r) => validations.push({
      what: r.name,
      evidence: r.mitigation || "Define mitigation owner, evidence and timeline.",
      impact: "High",
    }));
  // Source 2: low-confidence claims
  (report.claimEvidenceMap || [])
    .filter((c) => /low/i.test(c.confidence))
    .slice(0, 2)
    .forEach((c) => validations.push({
      what: c.claimText,
      evidence: c.userCanImproveBy || "Collect direct user/market evidence.",
      impact: "Medium",
    }));
  // Source 3: next steps
  (report.nextSteps || []).slice(0, 6 - validations.length).forEach((n) => {
    if (validations.length < 6) validations.push({
      what: n, evidence: "Owner, source and success criteria.", impact: "Medium",
    });
  });
  // Pad if empty
  while (validations.length < 4) {
    validations.push({
      what: "Validate top assumption", evidence: "Owner, evidence, success criteria.", impact: "Medium",
    });
  }

  const valRows: pptxgen.TableRow[] = [
    [
      { text: "Assumption / item", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Evidence needed", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Decision impact", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    ...validations.slice(0, 6).map((v) => [
      { text: truncate(v.what, 180), options: { bold: true } },
      { text: truncate(v.evidence, 220) },
      {
        text: v.impact,
        options: {
          bold: true,
          color: v.impact === "High" ? COLORS.danger : COLORS.warning,
          align: "center" as const,
        },
      },
    ] as pptxgen.TableRow),
  ];
  s4.addTable(valRows, {
    x: 0.5, y: 1.5, w: 12.3, colW: [4.3, 6.5, 1.5],
    fontSize: 11, fontFace: "Arial",
    border: { type: "solid", color: COLORS.border, pt: 1 },
    valign: "top",
  });

  /* ============================ Slide 5 — FMART-O Scorecard ============================ */
  const s5 = pptx.addSlide();
  chrome(s5, "FMART-O Scorecard", "Six-dimension feasibility breakdown");

  type DimensionKey = "financial" | "market" | "achievability" | "operational" | "risk" | "timing";
  const dimRows: Array<{ key: DimensionKey; label: string; score: number; finding: string }> = [
    { key: "financial",     label: "Financial",     score: report.scores.financial,     finding: report.scores.financialFinding || "" },
    { key: "market",        label: "Market",        score: report.scores.market,        finding: report.scores.marketFinding || "" },
    { key: "achievability", label: "Achievability", score: report.scores.achievability, finding: report.scores.achievabilityFinding || "" },
    { key: "operational",   label: "Operational",   score: report.scores.operational,   finding: report.scores.operationalFinding || "" },
    { key: "risk",          label: "Risk",          score: report.scores.risk,          finding: report.scores.riskFinding || "" },
    { key: "timing",        label: "Timing",        score: report.scores.timing,        finding: report.scores.timingFinding || "" },
  ];
  // Bar chart (left)
  s5.addChart(pptx.ChartType.bar, [{
    name: "Score (0-10)",
    labels: dimRows.map((d) => d.label),
    values: dimRows.map((d) => d.score),
  }], {
    x: 0.5, y: 1.5, w: 6.3, h: 5.5, barDir: "bar", showLegend: false,
    catAxisLabelFontSize: 12, valAxisMaxVal: 10, valAxisMinVal: 0, valAxisLabelFontSize: 10,
    chartColors: [COLORS.primary], showValue: true, dataLabelFontSize: 11, fontFace: "Arial",
  });

  // Findings (right) — compact
  dimRows.slice(0, 6).forEach((d, i) => {
    const y = 1.5 + i * 0.92;
    s5.addText(`${d.label} · ${d.score.toFixed(1)}`, {
      x: 7.1, y, w: 5.7, h: 0.3, fontSize: 11, bold: true, color: COLORS.primary, fontFace: "Arial",
    });
    s5.addText(truncate(d.finding || "Validate with stakeholder evidence.", 140), {
      x: 7.1, y: y + 0.3, w: 5.7, h: 0.55, fontSize: 10, color: COLORS.text, fontFace: "Arial", valign: "top",
    });
  });

  /* ============================ Slide 6 — Market Opportunity ============================ */
  const s6 = pptx.addSlide();
  chrome(s6, "Market Opportunity", "TAM · SAM · SOM (canonical)");

  const mktRows: pptxgen.TableRow[] = [
    [
      { text: "Tier", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Value", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "CAGR", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    [{ text: "TAM" }, { text: pack.market.tam, options: { bold: true, color: COLORS.primary } }, { text: pack.market.cagr || report.market.tamCagr || "—" }],
    [{ text: "SAM" }, { text: pack.market.sam, options: { bold: true, color: COLORS.primary } }, { text: report.market.samCagr || "—" }],
    [{ text: "SOM" }, { text: pack.market.som, options: { bold: true, color: COLORS.primary } }, { text: report.market.somCagr || "—" }],
  ];
  s6.addTable(mktRows, {
    x: 0.5, y: 1.5, w: 6, colW: [1.2, 3.0, 1.8],
    fontSize: 12, fontFace: "Arial",
    border: { type: "solid", color: COLORS.border, pt: 1 },
  });

  const signals = (report.research?.keySignals || []).filter(Boolean).slice(0, 3);
  const pains = (report.research?.painPoints || []).filter(Boolean).slice(0, 2);

  s6.addText("Demand signals", {
    x: 7, y: 1.5, w: 5.8, h: 0.35, fontSize: 12, bold: true, color: COLORS.primary, fontFace: "Arial",
  });
  s6.addText(
    (signals.length ? signals : ["Add demand evidence", "Add demand evidence", "Add demand evidence"])
      .map((t) => ({ text: truncate(t, 140), options: { bullet: { code: "25A0" } } })),
    { x: 7, y: 1.9, w: 5.8, h: 2.2, fontSize: 11, color: COLORS.text, fontFace: "Arial", valign: "top", paraSpaceAfter: 4 },
  );

  s6.addText("Pain points", {
    x: 7, y: 4.3, w: 5.8, h: 0.35, fontSize: 12, bold: true, color: COLORS.primary, fontFace: "Arial",
  });
  s6.addText(
    (pains.length ? pains : ["Add validated user pain", "Add validated user pain"])
      .map((t) => ({ text: truncate(t, 160), options: { bullet: { code: "25A0" } } })),
    { x: 7, y: 4.7, w: 5.8, h: 2.0, fontSize: 11, color: COLORS.text, fontFace: "Arial", valign: "top", paraSpaceAfter: 4 },
  );

  /* ============================ Slide 7 — Financial Outlook ============================ */
  const s7 = pptx.addSlide();
  chrome(s7, "Financial Outlook", "Canonical funding & break-even view");

  // KPI strip
  const finKpis = [
    ["Investment Range", pack.financial.investmentRange],
    ["CapEx (Mid)", pack.financial.capexMid],
    ["Monthly OpEx", pack.financial.monthlyOpex],
    ["Initial Funding Need", pack.financial.initialFundingNeed],
    ["Break-even", pack.financial.breakEvenDisplay],
    ...(internal ? [] : [["LTV : CAC", pack.financial.ltvCac]]),
  ];
  const finCardW = (W - 1.0 - (finKpis.length - 1) * 0.15) / finKpis.length;
  finKpis.forEach(([label, value], i) => {
    kpiCard(s7, 0.5 + i * (finCardW + 0.15), 1.45, finCardW, 1.5, label!, value!);
  });

  // Scenario table
  const scenRows: pptxgen.TableRow[] = [
    [
      { text: "Scenario",        options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Probability",     options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: internal ? "Adoption" : "Customers Y1", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: internal ? "Annual Financial Benefit" : "Annual Revenue", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Break-even",      options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    ...(report.financials.scenarios || []).map((sc) => [
      { text: sc.scenario, options: { bold: true } },
      { text: sc.probability },
      { text: internal ? (sc.adoptionRate != null ? `${Math.round(sc.adoptionRate * 100)}%` : "Requires validation") : (sc.subscribersYr1 || "Requires validation") },
      { text: internal
          ? (sc.annualValueDisplay || (sc.annualFinancialBenefit != null ? `${report.financials.currency} ${sc.annualFinancialBenefit.toLocaleString()}` : "Requires validation"))
          : (sc.annualRevenue || "Requires validation") },
      { text: sc.breakEven },
    ] as pptxgen.TableRow),
  ];
  s7.addTable(scenRows, {
    x: 0.5, y: 3.4, w: 12.3, colW: [2.5, 1.7, 2.5, 3.1, 2.5],
    fontSize: 12, fontFace: "Arial",
    border: { type: "solid", color: COLORS.border, pt: 1 },
    valign: "middle",
  });

  /* ============================ Slide 8 — Risk & Mitigation ============================ */
  const s8 = pptx.addSlide();
  chrome(s8, "Risk & Mitigation", "Canonical risk counts");

  kpiCard(s8, 0.5, 1.45, 4.0, 1.2, "High-severity Risks", String(pack.risk.highRiskCount), "High or Critical");
  kpiCard(s8, 4.7, 1.45, 4.0, 1.2, "Material Risks", String(pack.risk.materialRiskCount), "High + Medium");
  kpiCard(s8, 8.9, 1.45, 3.9, 1.2, "Risks Tracked", String((report.risks || []).length), "Full register");

  const topRisks = (pack.risk.topRisks.length ? pack.risk.topRisks : report.risks || []).slice(0, 5);
  const riskRows: pptxgen.TableRow[] = [
    [
      { text: "Risk",       options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Severity",   options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Mitigation", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    ...topRisks.map((r) => [
      { text: truncate(r.name, 80), options: { bold: true } },
      {
        text: r.level,
        options: {
          bold: true, align: "center" as const,
          color: r.level === "High" ? COLORS.danger : r.level === "Med" ? COLORS.warning : COLORS.success,
        },
      },
      { text: truncate(r.mitigation || "Define mitigation owner.", 240) },
    ] as pptxgen.TableRow),
  ];
  s8.addTable(riskRows, {
    x: 0.5, y: 2.9, w: 12.3, colW: [3.5, 1.5, 7.3],
    fontSize: 11, fontFace: "Arial",
    border: { type: "solid", color: COLORS.border, pt: 1 }, valign: "top",
  });

  /* ============================ Slide 9 — Evidence & Assumptions ============================ */
  const s9 = pptx.addSlide();
  chrome(s9, "Estimated Evidence Composition", "Heuristic estimate based on input completeness and available sources");

  const mix = pack.evidence.mix;
  kpiCard(s9, 0.5, 1.45, 2.9, 1.2, "User Input", `${mix.userInputPercent}%`);
  kpiCard(s9, 3.6, 1.45, 2.9, 1.2, "External Evidence", `${mix.webResearchPercent}%`);
  kpiCard(s9, 6.7, 1.45, 2.9, 1.2, "Calculations", `${mix.calculationPercent ?? 0}%`);
  kpiCard(s9, 9.8, 1.45, 3.0, 1.2, "AI Inference", `${mix.aiAssumptionPercent}%`,
    mix.aiAssumptionPercent > 40 ? "High dependency — validate" : "Acceptable");

  const claims = pack.evidence.topClaims.slice(0, 3);
  const claimRows: pptxgen.TableRow[] = [
    [
      { text: "ID",         options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Claim",      options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Model-estimated indicator", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Sources",    options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    ...(claims.length ? claims : [
      { claimId: "C-01", claimText: "Add a primary claim", confidence: "Low", sources: [] },
      { claimId: "C-02", claimText: "Add a primary claim", confidence: "Low", sources: [] },
      { claimId: "C-03", claimText: "Add a primary claim", confidence: "Low", sources: [] },
    ]).map((c) => [
      { text: c.claimId, options: { bold: true, align: "center" as const } },
      { text: truncate(c.claimText, 200) },
      { text: c.confidence || "—", options: { align: "center" as const } },
      {
        text: (c.sources || []).map((src) => `${src.relationship === "conflicting" ? "Conflict: " : ""}${src.domain || src.title}`).filter(Boolean).slice(0, 2).join(", ") || "—",
        options: { color: COLORS.muted },
      },
    ] as pptxgen.TableRow),
  ];
  s9.addTable(claimRows, {
    x: 0.5, y: 2.9, w: 12.3, colW: [0.9, 7.0, 1.5, 2.9],
    fontSize: 11, fontFace: "Arial",
    border: { type: "solid", color: COLORS.border, pt: 1 }, valign: "top",
  });

  /* ============================ Slide 10 — 30 / 60 / 90 Roadmap ============================ */
  const s10 = pptx.addSlide();
  chrome(s10, "30 / 60 / 90 Day Roadmap", "Validation plan");

  const phases: Array<{ title: string; items: string[] }> = [
    { title: "Next 30 days", items: (pack.roadmap.next30 || []).slice(0, 3) },
    { title: "Days 31 – 60", items: (pack.roadmap.days31to60 || []).slice(0, 3) },
    { title: "Days 61 – 90", items: (pack.roadmap.days61to90 || []).slice(0, 3) },
  ];
  phases.forEach((p) => {
    if (!p.items.length) {
      p.items = ["Define owner, evidence, and success criteria for this window."];
    }
  });

  const colW = 4.0;
  const gap = 0.3;
  const startCol = (W - (colW * 3 + gap * 2)) / 2;
  phases.forEach((p, i) => {
    const x = startCol + i * (colW + gap);
    s10.addShape("roundRect", {
      x, y: 1.7, w: colW, h: 4.9,
      fill: { color: COLORS.card }, line: { color: COLORS.border }, rectRadius: 0.1,
    });
    s10.addText(p.title.toUpperCase(), {
      x: x + 0.25, y: 1.9, w: colW - 0.5, h: 0.4,
      fontSize: 14, bold: true, color: COLORS.primary, charSpacing: 2, fontFace: "Arial",
    });
    s10.addText(
      p.items.slice(0, 3).map((t) => ({
        text: truncate(t, 220),
        options: { bullet: { code: "25A0" }, breakLine: true },
      })),
      {
        x: x + 0.25, y: 2.45, w: colW - 0.5, h: 4.0,
        fontSize: 12, color: COLORS.text, fontFace: "Arial", valign: "top", paraSpaceAfter: 8,
      },
    );
  });

  s10.addText("Generated by Concept AI · Not financial or legal advice", {
    x: 0.5, y: H - 0.45, w: 12, h: 0.3, fontSize: 10, color: COLORS.muted, fontFace: "Arial", align: "center",
  });

  return pptx;
}

export async function exportReportToPptx(
  rawReport: FeasibilityReport,
  inputs: ConceptInputs,
  fileName: string,
) {
  const pptx = buildReportPresentation(rawReport, inputs);
  await pptx.writeFile({ fileName: fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx` });
  return { fileName };
}
