// =============================================================================
// Concept AI — Excel Workbook (v2)
// -----------------------------------------------------------------------------
// 10-sheet finance / review workbook. Canonical values come from the shared
// ExportDecisionPack so the Dashboard, Financial Model and Risk counts always
// agree with the PDF and PPTX.
// =============================================================================

import ExcelJS from "exceljs";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { formatConfidence } from "@/lib/format";
import { buildExportDecisionPack, applyCanonicalToReport } from "@/lib/exportDecisionPack";
import { deriveAssumptionRegister } from "@/lib/evidence";

const PRIMARY = "FF1F4ED8";
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: PRIMARY } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const BORDER = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

const styleHeader = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = ALL_BORDERS;
    cell.alignment = { vertical: "middle" };
  });
  row.height = 22;
};

const borderRow = (row: ExcelJS.Row) => {
  row.eachCell((c) => (c.border = ALL_BORDERS));
};

const autoWidth = (ws: ExcelJS.Worksheet, min = 12, max = 60) => {
  ws.columns.forEach((col) => {
    let m = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = String(cell.value ?? "");
      if (v.length > m) m = Math.min(max, v.length + 2);
    });
    col.width = m;
  });
};

const num = (s?: string) => {
  const raw = (s || "").toString().trim();
  if (!raw) return 0;

  const cleaned = raw.replace(/,/g, "");
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return 0;

  const value = Number(m[0]);
  const tail = cleaned.slice(m.index! + m[0].length).toLowerCase();

  if (/\b(t|tn|trillion)\b/.test(tail)) return value * 1_000_000_000_000;
  if (/\b(b|bn|billion)\b/.test(tail)) return value * 1_000_000_000;
  if (/\b(m|mn|million)\b/.test(tail)) return value * 1_000_000;
  if (/\b(k|thousand)\b/.test(tail)) return value * 1_000;

  return value;
};

const sourceConfidenceLabel = (value: unknown): string => {
  const t = String(value ?? "").trim().toLowerCase();

  if (!t) return "—";
  if (t.startsWith("high")) return "High";
  if (t.startsWith("med")) return "Medium";
  if (t.startsWith("low")) return "Low";

  // Numeric scores like 76 should not render as raw consumer-facing confidence.
  const n = Number(t);
  if (Number.isFinite(n)) {
    if (n >= 75) return "High";
    if (n >= 50) return "Medium";
    return "Low";
  }

  return "—";
};


export async function exportReportToXlsx(
  rawReport: FeasibilityReport,
  inputs: ConceptInputs,
  fileName: string,
) {
  const pack = buildExportDecisionPack(rawReport, inputs);
  const report = applyCanonicalToReport(rawReport, pack);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Concept AI";
  wb.created = new Date();

  /* ========================= Sheet 1 — Dashboard ========================= */
  const dash = wb.addWorksheet("Dashboard");
  dash.addRow(["Concept AI — Executive Dashboard"]).font = { bold: true, size: 16, color: { argb: PRIMARY } };
  dash.addRow([
    `${inputs.projectName || "Untitled"} · ${inputs.industry || ""}${inputs.location ? " · " + inputs.location : ""}`,
  ]).font = { italic: true, color: { argb: "FF64748B" } };
  dash.addRow([]);

  styleHeader(dash.addRow(["Field", "Value"]));
  const dashRows: Array<[string, string | number]> = [
    ["Report ID", pack.identity.reportId],
    ["Date Issued", pack.identity.date],
    ["Verdict", pack.verdict.canonical],
    ["Overall Score", `${pack.score.overall.toFixed(1)} / 10`],
    ["Decision Confidence", pack.score.decisionConfidencePct != null ? `${pack.score.decisionConfidencePct}%` : "—"],
    ["Investment Range", pack.financial.investmentRange],
    ["CapEx (Mid)", pack.financial.capexMid],
    ["Monthly OpEx", pack.financial.monthlyOpex],
    ["Initial Funding Need", pack.financial.initialFundingNeed],
    ["Break-even", pack.financial.breakEvenDisplay],
    ["LTV : CAC", pack.financial.ltvCac],
    ["TAM", pack.market.tam],
    ["SAM", pack.market.sam],
    ["SOM", pack.market.som],
    ["CAGR", pack.market.cagr || "—"],
    ["High-severity Risks", pack.risk.highRiskCount],
    ["Material Risks (High + Med)", pack.risk.materialRiskCount],
    ["Evidence — User input %", pack.evidence.mix.userInputPercent],
    ["Evidence — Web research %", pack.evidence.mix.webResearchPercent],
    ["Evidence — AI assumption %", pack.evidence.mix.aiAssumptionPercent],
  ];
  dashRows.forEach((r) => borderRow(dash.addRow(r)));
  autoWidth(dash);

  /* ========================= Sheet 2 — Inputs ========================= */
  const ws2 = wb.addWorksheet("Inputs");
  styleHeader(ws2.addRow(["Field", "Value"]));
  const inputRows: Array<[string, string]> = [
    ["Project name", inputs.projectName],
    ["Industry", inputs.industry],
    ["Location", inputs.location],
    ["Description", inputs.description],
    ["Strategic objectives", inputs.strategicObjectives],
    ["Business model", inputs.businessModel],
    ["Revenue model", inputs.revenueModel],
    ["Founder experience", inputs.founderExperience],
    ["Budget range", inputs.budgetRange],
    ["Timeline", inputs.timeline],
    ["Team size", inputs.teamSize],
    ["Dependencies", inputs.dependencies],
    ["Assumptions", inputs.assumptions],
    ["Constraints", inputs.constraints],
    ["Success factors", inputs.successFactors],
    ["Known risks", inputs.knownRisks],
    ["Regulatory considerations", inputs.regulatoryConsiderations],
    ["Technology readiness", inputs.technologyReadiness],
    ["Competitor URLs", inputs.competitorUrls],
  ];
  inputRows.forEach(([k, v]) => {
    const row = ws2.addRow([k, v || ""]);
    borderRow(row);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  ws2.getColumn(1).width = 30;
  ws2.getColumn(2).width = 80;

  /* ========================= Sheet 3 — Assumptions ========================= */
  const ws3 = wb.addWorksheet("Assumptions");
  styleHeader(ws3.addRow(["Assumption", "Source", "Confidence", "Risk if wrong", "What to add"]));
  const register = deriveAssumptionRegister(report, inputs);
  if (register.length === 0) {
    const r = ws3.addRow(["No structured assumptions captured yet.", "", "", "", ""]);
    borderRow(r);
  } else {
    register.forEach((a) => {
      const row = ws3.addRow([
        a.assumption,
        a.sourceType,
        a.confidence,
        a.riskIfWrong,
        a.whatToAdd,
      ]);
      borderRow(row);
      [1, 4, 5].forEach((i) => (row.getCell(i).alignment = { wrapText: true, vertical: "top" }));
    });
  }
  ws3.getColumn(1).width = 50;
  ws3.getColumn(2).width = 16;
  ws3.getColumn(3).width = 14;
  ws3.getColumn(4).width = 40;
  ws3.getColumn(5).width = 40;

  /* ========================= Sheet 4 — Financial Model ========================= */
  const fin = wb.addWorksheet("Financial Model");
  fin.addRow(["Currency", report.financials.currency || ""]).font = { bold: true };
  fin.addRow([]);

  fin.addRow(["CapEx Items"]).font = { bold: true, color: { argb: PRIMARY } };
  const ch = fin.addRow(["Category", "Low", "High", "Mid (formula)", "Notes"]);
  styleHeader(ch);
  const capExStart = fin.lastRow!.number + 1;
  (report.financials.capEx || []).forEach((c) => {
    const row = fin.addRow([c.category, c.low, c.high, null, c.notes]);
    row.getCell(4).value = { formula: `(B${row.number}+C${row.number})/2` } as ExcelJS.CellFormulaValue;
    borderRow(row);
    [2, 3, 4].forEach((i) => (row.getCell(i).numFmt = "#,##0"));
  });
  const capExEnd = fin.lastRow!.number;
  const capTotal = fin.addRow(["TOTAL", null, null, null, ""]);
  if (capExEnd >= capExStart) {
    capTotal.getCell(2).value = { formula: `SUM(B${capExStart}:B${capExEnd})` } as ExcelJS.CellFormulaValue;
    capTotal.getCell(3).value = { formula: `SUM(C${capExStart}:C${capExEnd})` } as ExcelJS.CellFormulaValue;
    capTotal.getCell(4).value = { formula: `SUM(D${capExStart}:D${capExEnd})` } as ExcelJS.CellFormulaValue;
  }
  capTotal.font = { bold: true, color: { argb: PRIMARY } };
  [2, 3, 4].forEach((i) => (capTotal.getCell(i).numFmt = "#,##0"));
  capTotal.getCell(5).value = "";

  fin.addRow([]);
  fin.addRow(["OpEx Items"]).font = { bold: true, color: { argb: PRIMARY } };
  const oh = fin.addRow(["Category", "Monthly", "Annual (formula)"]);
  styleHeader(oh);
  const opStart = fin.lastRow!.number + 1;
  (report.financials.opEx || []).forEach((o) => {
    const row = fin.addRow([o.category, o.monthly, null]);
    row.getCell(3).value = { formula: `B${row.number}*12` } as ExcelJS.CellFormulaValue;
    borderRow(row);
    row.getCell(2).numFmt = "#,##0";
    row.getCell(3).numFmt = "#,##0";
  });
  const opEnd = fin.lastRow!.number;
  const opTotal = fin.addRow(["TOTAL", null, null]);
  if (opEnd >= opStart) {
    opTotal.getCell(2).value = { formula: `SUM(B${opStart}:B${opEnd})` } as ExcelJS.CellFormulaValue;
    opTotal.getCell(3).value = { formula: `SUM(C${opStart}:C${opEnd})` } as ExcelJS.CellFormulaValue;
  }
  opTotal.font = { bold: true, color: { argb: PRIMARY } };
  [2, 3].forEach((i) => (opTotal.getCell(i).numFmt = "#,##0"));

  fin.addRow([]);
  fin.addRow(["Summary"]).font = { bold: true, color: { argb: PRIMARY } };
  styleHeader(fin.addRow(["Metric", "Value"]));
  [
    ["Investment Range (canonical)", pack.financial.investmentRange],
    ["CapEx Mid (canonical)", pack.financial.capexMid],
    ["Monthly OpEx (canonical)", pack.financial.monthlyOpex],
    ["Initial Funding Need (canonical)", pack.financial.initialFundingNeed],
    ["Break-even (canonical)", pack.financial.breakEvenDisplay],
  ].forEach((r) => borderRow(fin.addRow(r)));
  autoWidth(fin);

  /* ========================= Sheet 5 — Scenarios ========================= */
  const ws5 = wb.addWorksheet("Scenarios");
  styleHeader(ws5.addRow(["Scenario", "Probability", "Customers Y1", "Annual Revenue", "Break-even"]));
  (report.financials.scenarios || []).forEach((sc) => {
    const row = ws5.addRow([
      sc.scenario,
      sc.probability,
      sc.subscribersYr1,
      num(sc.annualRevenue),
      sc.breakEven,
    ]);
    borderRow(row);
    row.getCell(4).numFmt = "#,##0";
  });
  autoWidth(ws5);

  /* ========================= Sheet 6 — Sensitivity ========================= */
  const sens = wb.addWorksheet("Sensitivity");
  sens.addRow(["Sensitivity model — edit blue cells"]).font = { bold: true, size: 14, color: { argb: PRIMARY } };
  sens.addRow([]);
  const baseRev =
    num(report.financials.scenarios?.find((s) => s.scenario === "Base Case")?.annualRevenue) ||
    num(report.financials.scenarios?.[0]?.annualRevenue) ||
    1_000_000;
  const baseOpex =
    (report.financials.opEx || []).reduce((s, x) => s + (x.annual || 0), 0) || baseRev * 0.6;
  const baseCapex =
    report.financials.capExTotal?.mid ||
    ((report.financials.capExTotal?.low || 0) + (report.financials.capExTotal?.high || 0)) / 2 ||
    baseRev * 0.3;

  const ih = sens.addRow(["Driver", "Multiplier"]);
  styleHeader(ih);
  const drivers: Array<[string, number]> = [
    ["Revenue", 1],
    ["Costs", 1],
    ["CAC", 1],
    ["Conversion", 1],
    ["Adoption", 1],
  ];
  drivers.forEach(([label, val]) => {
    const row = sens.addRow([label, val]);
    row.getCell(2).font = { color: { argb: "FF0000FF" }, bold: true };
    row.getCell(2).numFmt = "0%";
    borderRow(row);
  });
  const driverStart = ih.number + 1;
  const revRow = driverStart;
  const costRow = driverStart + 1;
  const cacRow = driverStart + 2;
  const convRow = driverStart + 3;
  const adoptRow = driverStart + 4;

  sens.addRow([]);
  const bh = sens.addRow(["Base Case Inputs", "Value"]);
  styleHeader(bh);
  sens.addRow(["Revenue (annual)", baseRev]).getCell(2).numFmt = "#,##0";
  sens.addRow(["OpEx (annual)", baseOpex]).getCell(2).numFmt = "#,##0";
  sens.addRow(["CapEx", baseCapex]).getCell(2).numFmt = "#,##0";
  const baseRevRow = bh.number + 1;
  const baseOpexRow = bh.number + 2;
  const baseCapexRow = bh.number + 3;

  sens.addRow([]);
  const oh2 = sens.addRow(["Scenario Output", "Formula", "Value"]);
  styleHeader(oh2);
  const addCalc = (label: string, formula: string, fmt = "#,##0") => {
    const row = sens.addRow([label, formula, null]);
    row.getCell(3).value = { formula } as ExcelJS.CellFormulaValue;
    row.getCell(3).numFmt = fmt;
    row.getCell(3).font = { bold: true };
    borderRow(row);
  };
  addCalc("Adjusted Revenue", `B${baseRevRow}*B${revRow}*B${convRow}*B${adoptRow}`);
  addCalc("Adjusted OpEx", `B${baseOpexRow}*B${costRow}*(0.7+0.3*B${cacRow})`);
  addCalc("Gross Profit", `C${oh2.number + 1}-C${oh2.number + 2}`);
  addCalc("Net Profit (Y1)", `C${oh2.number + 3}-B${baseCapexRow}*0.2`);
  addCalc("Payback (months)", `IFERROR(B${baseCapexRow}/(C${oh2.number + 3}/12),0)`, "0.0");
  addCalc("ROI Y1", `IFERROR(C${oh2.number + 4}/B${baseCapexRow},0)`, "0.0%");
  autoWidth(sens);

  /* ========================= Sheet 7 — Market ========================= */
  const market = wb.addWorksheet("Market");
  styleHeader(market.addRow(["Tier", "Label", "Value (canonical)", "CAGR"]));
  [
    ["TAM", report.market.tamLabel, pack.market.tam, pack.market.cagr || report.market.tamCagr],
    ["SAM", report.market.samLabel, pack.market.sam, report.market.samCagr],
    ["SOM", report.market.somLabel, pack.market.som, report.market.somCagr],
  ].forEach((r) => borderRow(market.addRow(r)));

  if (report.market.growthChart && report.market.growthChart.length) {
    market.addRow([]);
    styleHeader(market.addRow(["Year", "TAM", "SAM"]));
    report.market.growthChart.forEach((p) =>
      borderRow(market.addRow([p.year, p.tam, p.sam])),
    );
  }
  autoWidth(market);

  /* ========================= Sheet 8 — Risks ========================= */
  const risks = wb.addWorksheet("Risks");
  styleHeader(risks.addRow(["Risk", "Probability", "Impact", "Severity", "Mitigation"]));
  (report.risks || []).forEach((r) => {
    const row = risks.addRow([r.name, r.probability, r.impact, r.level, r.mitigation]);
    borderRow(row);
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    const lvlCell = row.getCell(4);
    lvlCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: r.level === "High" ? "FFFCA5A5" : r.level === "Med" ? "FFFCD34D" : "FF86EFAC" },
    };
  });
  risks.getColumn(5).width = 60;
  autoWidth(risks);

  /* ========================= Sheet 9 — Sources ========================= */
  const src = wb.addWorksheet("Sources");
  styleHeader(src.addRow(["Source", "Domain", "URL", "Takeaway / claim supported", "Confidence"]));

  // Map domain from URL
  const domainOf = (u?: string) => {
    if (!u) return "";
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  // Curated citations first
  const cits = report.research?.citations || [];
  cits.forEach((c) => {
    const row = src.addRow([
      c.title || c.source || "—",
      domainOf(c.url),
      c.url || "",
      c.takeaway || "",
      "—",
    ]);
    borderRow(row);
    row.getCell(4).alignment = { wrapText: true, vertical: "top" };
  });

  // Claim ID lookup: which claims reference each source domain
  const topClaims = pack.evidence.topClaims;
  if (topClaims.length) {
    src.addRow([]);
    src.addRow(["Top claims & source confidence"]).font = { bold: true, color: { argb: PRIMARY } };
    styleHeader(src.addRow(["Claim ID", "Claim", "Confidence", "Source domains"]));
    topClaims.forEach((c) => {
      const row = src.addRow([
        c.claimId,
        c.claimText,
        c.confidence,
        c.sources.map((s) => s.domain || s.title).filter(Boolean).join(", "),
      ]);
      borderRow(row);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    });
  }
  src.getColumn(1).width = 30;
  src.getColumn(2).width = 25;
  src.getColumn(3).width = 50;
  src.getColumn(4).width = 50;
  src.getColumn(5).width = 16;

  /* ========================= Sheet 10 — Recommendations ========================= */
  const rec = wb.addWorksheet("Recommendations");
  rec.addRow(["Strategic Recommendations"]).font = { bold: true, color: { argb: PRIMARY } };
  (report.recommendations || []).forEach((r, i) => {
    const row = rec.addRow([`${i + 1}.`, r]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  rec.addRow([]);
  rec.addRow(["Next Steps"]).font = { bold: true, color: { argb: PRIMARY } };
  (report.nextSteps || []).forEach((r, i) => {
    const row = rec.addRow([`${i + 1}.`, r]);
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  rec.addRow([]);
  rec.addRow(["30 / 60 / 90 Roadmap"]).font = { bold: true, color: { argb: PRIMARY } };
  styleHeader(rec.addRow(["Window", "Action"]));
  const phases: Array<[string, string[]]> = [
    ["Next 30 days", pack.roadmap.next30 || []],
    ["Days 31 – 60", pack.roadmap.days31to60 || []],
    ["Days 61 – 90", pack.roadmap.days61to90 || []],
  ];
  phases.forEach(([label, items]) => {
    (items.length ? items : ["Define owner, evidence, and success criteria."]).forEach((it) => {
      const row = rec.addRow([label, it]);
      borderRow(row);
      row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    });
  });
  rec.getColumn(1).width = 20;
  rec.getColumn(2).width = 80;

  /* ============================ FMART-O reference sheet (kept) ============================ */
  // Keep prior scorecard view for review parity with the report.
  const scores = wb.addWorksheet("FMART-O Scores");
  styleHeader(scores.addRow(["Dimension", "Score (0-10)", "Weight", "Confidence", "Finding", "Rationale"]));
  const dims = ["financial", "market", "achievability", "operational", "risk", "timing"] as const;
  const dimLabels: Record<string, string> = {
    financial: "Financial",
    market: "Market",
    achievability: "Achievability",
    operational: "Operational",
    risk: "Risk (inverse)",
    timing: "Timing",
  };
  dims.forEach((k) => {
    const r = scores.addRow([
      dimLabels[k],
      report.scores[k],
      report.scores.weights?.[k] ?? "",
      formatConfidence(report.scores.confidence?.[k]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (report.scores as any)[`${k}Finding`] ?? "",
      report.scores.rationale?.[k] ?? "",
    ]);
    borderRow(r);
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
  });
  scores.addRow([]);
  const overall = scores.addRow(["OVERALL", report.scores.overall, "", "", pack.verdict.canonical, ""]);
  overall.font = { bold: true, color: { argb: PRIMARY } };
  scores.getColumn(5).width = 50;
  scores.getColumn(6).width = 50;
  autoWidth(scores);

  /* ----------------------------- Trigger download ----------------------------- */
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { fileName: link.download, bytes: blob.size };
}
