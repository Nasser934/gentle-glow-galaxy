import pptxgen from "pptxgenjs";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { buildExportDecisionPack, applyCanonicalToReport } from "@/lib/exportDecisionPack";

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

const verdictColor = (v: string) =>
  v === "PROCEED" ? COLORS.success
  : v === "PROCEED WITH CAUTION" || v === "REVISE" ? COLORS.warning
  : COLORS.danger;

const num = (s?: string) => { const m = s?.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; };

export async function exportReportToPptx(rawReport: FeasibilityReport, inputs: ConceptInputs, fileName: string) {
  // Canonical export pack — verdict, break-even, financial labels & risk counts
  // match PDF and XLSX.
  const pack = buildExportDecisionPack(rawReport, inputs);
  const report = applyCanonicalToReport(rawReport, pack);

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = `${inputs.projectName} — Feasibility Report`;
  pptx.author = "Concept AI";

  const W = 13.33;
  const H = 7.5;

  // ---------- Slide 1: Cover ----------
  const s1 = pptx.addSlide();
  s1.background = { color: COLORS.primaryDark };
  s1.addShape("rect", { x: 0, y: 0, w: W, h: 1.2, fill: { color: COLORS.primary } });
  s1.addText("CONCEPT AI · FEASIBILITY REPORT", {
    x: 0.6, y: 0.35, w: 12, h: 0.5, fontSize: 12, bold: true, color: COLORS.white, fontFace: "Inter", charSpacing: 4,
  });
  s1.addText(inputs.projectName || "Untitled Project", {
    x: 0.6, y: 1.8, w: 12, h: 1.4, fontSize: 48, bold: true, color: COLORS.white, fontFace: "Inter",
  });
  s1.addText(`${inputs.industry || ""}${inputs.location ? " · " + inputs.location : ""}`, {
    x: 0.6, y: 3.2, w: 12, h: 0.5, fontSize: 18, color: "CADCFC", fontFace: "Inter",
  });
  // Verdict pill
  s1.addShape("roundRect", {
    x: 0.6, y: 4.2, w: 4, h: 0.7, fill: { color: verdictColor(report.scores.verdict) }, line: { color: verdictColor(report.scores.verdict) }, rectRadius: 0.1,
  });
  s1.addText(report.scores.verdict, {
    x: 0.6, y: 4.2, w: 4, h: 0.7, fontSize: 18, bold: true, color: COLORS.white, align: "center", valign: "middle", fontFace: "Inter",
  });
  s1.addText(`Overall score: ${report.scores.overall.toFixed(1)} / 10`, {
    x: 4.8, y: 4.2, w: 5, h: 0.7, fontSize: 18, bold: true, color: COLORS.white, valign: "middle", fontFace: "Inter",
  });
  s1.addText(`Report ID ${report.reportId} · ${report.dateIssued} · ${report.classification}`, {
    x: 0.6, y: 6.7, w: 12, h: 0.4, fontSize: 11, color: "94A3B8", fontFace: "Inter",
  });

  // Page chrome helper
  const chrome = (s: pptxgen.Slide, title: string, subtitle?: string) => {
    s.background = { color: COLORS.white };
    s.addShape("rect", { x: 0, y: 0, w: W, h: 0.08, fill: { color: COLORS.primary }, line: { color: COLORS.primary } });
    s.addText(title, { x: 0.5, y: 0.25, w: 12, h: 0.6, fontSize: 26, bold: true, color: COLORS.text, fontFace: "Inter" });
    if (subtitle) s.addText(subtitle, { x: 0.5, y: 0.85, w: 12, h: 0.4, fontSize: 13, color: COLORS.muted, fontFace: "Inter" });
    s.addText(`${inputs.projectName} · Concept AI · Confidential`, { x: 0.5, y: H - 0.35, w: 12, h: 0.3, fontSize: 9, color: COLORS.muted, fontFace: "Inter" });
  };

  // ---------- Slide 2: Executive Summary ----------
  const s2 = pptx.addSlide(); chrome(s2, "Executive Summary", report.scores.verdict);
  s2.addText(report.executiveSummary, {
    x: 0.5, y: 1.5, w: 8, h: 5.4, fontSize: 13, color: COLORS.text, fontFace: "Inter", valign: "top",
  });
  // KPI cards on right
  const kpis = [
    { label: "Investment", value: report.financials.investmentRange },
    { label: "Break-even", value: report.financials.breakEvenSummary },
    { label: "TAM", value: report.market.tamValue },
    { label: "Overall", value: `${report.scores.overall.toFixed(1)} / 10` },
  ];
  kpis.forEach((k, i) => {
    const y = 1.5 + i * 1.35;
    s2.addShape("roundRect", { x: 9, y, w: 3.8, h: 1.15, fill: { color: COLORS.card }, line: { color: COLORS.border }, rectRadius: 0.08 });
    s2.addText(k.label.toUpperCase(), { x: 9.2, y: y + 0.1, w: 3.4, h: 0.3, fontSize: 10, bold: true, color: COLORS.muted, charSpacing: 2, fontFace: "Inter" });
    s2.addText(k.value, { x: 9.2, y: y + 0.4, w: 3.4, h: 0.7, fontSize: 18, bold: true, color: COLORS.primary, fontFace: "Inter" });
  });

  // ---------- Slide 3: FMART Scores (bar chart) ----------
  const s3 = pptx.addSlide(); chrome(s3, "FMART Scoring", "Six-dimension feasibility breakdown");
  const scoreData = [{
    name: "Score (0-10)",
    labels: ["Financial", "Market", "Achievable", "Operational", "Risk", "Timing"],
    values: [report.scores.financial, report.scores.market, report.scores.achievability, report.scores.operational, report.scores.risk, report.scores.timing],
  }];
  s3.addChart(pptx.ChartType.bar, scoreData, {
    x: 0.5, y: 1.5, w: 7.5, h: 5.5, barDir: "bar", showLegend: false,
    catAxisLabelFontSize: 12, valAxisMaxVal: 10, valAxisMinVal: 0, valAxisLabelFontSize: 10,
    chartColors: [COLORS.primary], showValue: true, dataLabelFontSize: 11,
  });
  // Findings list
  const findings = [
    ["Financial", report.scores.financialFinding],
    ["Market", report.scores.marketFinding],
    ["Achievable", report.scores.achievabilityFinding],
    ["Risk", report.scores.riskFinding],
  ];
  findings.forEach(([label, text], i) => {
    const y = 1.5 + i * 1.35;
    s3.addText(label, { x: 8.3, y, w: 4.5, h: 0.3, fontSize: 11, bold: true, color: COLORS.primary, fontFace: "Inter" });
    s3.addText(text, { x: 8.3, y: y + 0.3, w: 4.5, h: 1, fontSize: 10, color: COLORS.text, fontFace: "Inter", valign: "top" });
  });

  // ---------- Slide 4: Market Sizing ----------
  const s4 = pptx.addSlide(); chrome(s4, "Market Opportunity", "TAM · SAM · SOM");
  const marketRows: pptxgen.TableRow[] = [
    [
      { text: "Tier", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Definition", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Value", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "CAGR", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    [{ text: "TAM" }, { text: report.market.tamLabel }, { text: report.market.tamValue, options: { bold: true, color: COLORS.primary } }, { text: report.market.tamCagr }],
    [{ text: "SAM" }, { text: report.market.samLabel }, { text: report.market.samValue, options: { bold: true, color: COLORS.primary } }, { text: report.market.samCagr }],
    [{ text: "SOM" }, { text: report.market.somLabel }, { text: report.market.somValue, options: { bold: true, color: COLORS.primary } }, { text: report.market.somCagr }],
  ];
  s4.addTable(marketRows, { x: 0.5, y: 1.5, w: 7, colW: [1, 2.5, 2, 1.5], fontSize: 12, fontFace: "Inter", border: { type: "solid", color: COLORS.border, pt: 1 } });

  if (report.market.growthChart && report.market.growthChart.length > 0) {
    const growthData = [
      { name: "TAM", labels: report.market.growthChart.map((p) => p.year), values: report.market.growthChart.map((p) => p.tam) },
      { name: "SAM", labels: report.market.growthChart.map((p) => p.year), values: report.market.growthChart.map((p) => p.sam) },
    ];
    s4.addChart(pptx.ChartType.line, growthData, {
      x: 8, y: 1.5, w: 4.8, h: 5.5, showLegend: true, legendPos: "b", chartColors: [COLORS.primary, COLORS.success], lineSize: 3, fontFace: "Inter",
    });
  }

  // ---------- Slide 5: Financials (scenarios chart + capex pie) ----------
  const s5 = pptx.addSlide(); chrome(s5, "Financial Outlook", `${report.financials.currency} · ${report.financials.investmentRange}`);
  const scenarioData = [{
    name: "Annual Revenue",
    labels: report.financials.scenarios.map((s) => s.scenario),
    values: report.financials.scenarios.map((s) => num(s.annualRevenue)),
  }];
  s5.addChart(pptx.ChartType.bar, scenarioData, {
    x: 0.5, y: 1.5, w: 6, h: 5.5, barDir: "col", showLegend: false, chartColors: [COLORS.primary],
    showValue: true, dataLabelFontSize: 11, catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, fontFace: "Inter",
  });
  if (report.financials.capEx && report.financials.capEx.length > 0) {
    const capData = [{
      name: "CapEx",
      labels: report.financials.capEx.map((c) => c.category),
      values: report.financials.capEx.map((c) => (c.low + c.high) / 2),
    }];
    s5.addChart(pptx.ChartType.doughnut, capData, {
      x: 7, y: 1.5, w: 5.8, h: 5.5, showLegend: true, legendPos: "r", legendFontSize: 10,
      chartColors: [COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, "8B5CF6", "06B6D4"], fontFace: "Inter",
    });
  }

  // ---------- Slide 6: Top Risks ----------
  const s6 = pptx.addSlide(); chrome(s6, "Risk Register", "Probability × impact assessment");
  const riskRows: pptxgen.TableRow[] = [
    [
      { text: "Risk", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Prob.", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Impact", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Level", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
      { text: "Mitigation", options: { bold: true, color: COLORS.white, fill: { color: COLORS.primary } } },
    ],
    ...report.risks.slice(0, 8).map((r) => [
      { text: r.name },
      { text: r.probability },
      { text: r.impact },
      { text: r.level, options: { bold: true, color: r.level === "High" ? COLORS.danger : r.level === "Med" ? COLORS.warning : COLORS.success } },
      { text: r.mitigation },
    ] as pptxgen.TableRow),
  ];
  s6.addTable(riskRows, {
    x: 0.5, y: 1.5, w: 12.3, colW: [3, 1, 1, 1, 6.3], fontSize: 11, fontFace: "Inter",
    border: { type: "solid", color: COLORS.border, pt: 1 }, valign: "top",
  });

  // ---------- Slide 7: Recommendations & Next Steps ----------
  const s7 = pptx.addSlide(); chrome(s7, "Recommendations & Next Steps", "Strategic actions for execution");
  s7.addText("Strategic Recommendations", { x: 0.5, y: 1.5, w: 6, h: 0.4, fontSize: 14, bold: true, color: COLORS.primary, fontFace: "Inter" });
  s7.addText(report.recommendations.slice(0, 6).map((r) => ({ text: r, options: { bullet: { code: "25A0" } } })), {
    x: 0.5, y: 2, w: 6, h: 5, fontSize: 12, color: COLORS.text, fontFace: "Inter", valign: "top", paraSpaceAfter: 8,
  });
  s7.addText("Next Steps", { x: 7, y: 1.5, w: 5.8, h: 0.4, fontSize: 14, bold: true, color: COLORS.primary, fontFace: "Inter" });
  s7.addText(report.nextSteps.slice(0, 6).map((r, i) => ({ text: `${i + 1}. ${r}`, options: {} })), {
    x: 7, y: 2, w: 5.8, h: 5, fontSize: 12, color: COLORS.text, fontFace: "Inter", valign: "top", paraSpaceAfter: 8,
  });

  // ---------- Slide 8: Closing ----------
  const s8 = pptx.addSlide();
  s8.background = { color: COLORS.primaryDark };
  s8.addText("Thank you", { x: 0.6, y: 2.8, w: 12, h: 1.2, fontSize: 56, bold: true, color: COLORS.white, fontFace: "Inter" });
  s8.addText("Generated by Concept AI · Not financial advice", { x: 0.6, y: 4.2, w: 12, h: 0.5, fontSize: 14, color: "CADCFC", fontFace: "Inter" });
  s8.addText(`Report ${report.reportId} · ${report.dateIssued}`, { x: 0.6, y: 6.8, w: 12, h: 0.4, fontSize: 11, color: "94A3B8", fontFace: "Inter" });

  await pptx.writeFile({ fileName: fileName.endsWith(".pptx") ? fileName : `${fileName}.pptx` });
  return { fileName };
}
