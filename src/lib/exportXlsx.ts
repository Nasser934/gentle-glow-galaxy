import ExcelJS from "exceljs";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { formatConfidence } from "@/lib/format";
import { buildExportDecisionPack, applyCanonicalToReport } from "@/lib/exportDecisionPack";

const PRIMARY = "FF1F4ED8";
const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: PRIMARY } };
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
const BORDER = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

const styleHeader = (row: ExcelJS.Row) => {
  row.eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; cell.border = ALL_BORDERS; cell.alignment = { vertical: "middle" }; });
  row.height = 22;
};

const autoWidth = (ws: ExcelJS.Worksheet) => {
  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => { const v = String(cell.value ?? ""); if (v.length > max) max = Math.min(60, v.length + 2); });
    col.width = max;
  });
};

const num = (s?: string) => { const m = s?.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; };

export async function exportReportToXlsx(report: FeasibilityReport, inputs: ConceptInputs, fileName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Concept AI";
  wb.created = new Date();

  // ---------- Summary ----------
  const summary = wb.addWorksheet("Executive Summary");
  summary.addRow(["Concept AI — Feasibility Report"]).font = { bold: true, size: 16, color: { argb: PRIMARY } };
  summary.addRow([`${inputs.projectName} — ${inputs.location || ""}`]).font = { italic: true, color: { argb: "FF64748B" } };
  summary.addRow([]);
  const sumHeader = summary.addRow(["Field", "Value"]); styleHeader(sumHeader);
  [
    ["Report ID", report.reportId],
    ["Date Issued", report.dateIssued],
    ["Industry", inputs.industry],
    ["Verdict", report.scores.verdict],
    ["Overall Score", `${report.scores.overall.toFixed(1)} / 10`],
    ["Investment", report.financials.investmentRange],
    ["Break-even", report.financials.breakEvenSummary],
    ["Methodology", report.methodology],
  ].forEach((r) => { const row = summary.addRow(r); row.eachCell((c) => c.border = ALL_BORDERS); });
  summary.addRow([]);
  summary.addRow(["Executive Summary"]).font = { bold: true };
  const exec = summary.addRow([report.executiveSummary]); exec.getCell(1).alignment = { wrapText: true, vertical: "top" };
  summary.mergeCells(exec.number, 1, exec.number, 4); exec.height = 120;
  autoWidth(summary);

  // ---------- FMART Scores ----------
  const scores = wb.addWorksheet("FMART Scores");
  const sh = scores.addRow(["Dimension", "Score (0-10)", "Weight", "Confidence", "Finding", "Rationale"]); styleHeader(sh);
  const dims = ["financial", "market", "achievability", "operational", "risk", "timing"] as const;
  const labels: Record<string, string> = {
    financial: "Financial", market: "Market", achievability: "Technical Achievability",
    operational: "Operational", risk: "Risk (inverse)", timing: "Market Timing",
  };
  dims.forEach((k) => {
    const r = scores.addRow([
      labels[k],
      report.scores[k],
      report.scores.weights?.[k] ?? "",
      formatConfidence(report.scores.confidence?.[k]),
      (report.scores as any)[`${k}Finding`] ?? "",
      report.scores.rationale?.[k] ?? "",
    ]);
    r.eachCell((c) => c.border = ALL_BORDERS);
    r.getCell(5).alignment = { wrapText: true, vertical: "top" };
    r.getCell(6).alignment = { wrapText: true, vertical: "top" };
  });
  // Overall row with formula (weighted average if weights provided)
  scores.addRow([]);
  const overall = scores.addRow(["OVERALL", report.scores.overall, "", "", report.scores.verdict, ""]);
  overall.font = { bold: true, color: { argb: PRIMARY } };
  scores.getColumn(5).width = 50; scores.getColumn(6).width = 50;
  autoWidth(scores);

  // ---------- Market ----------
  const market = wb.addWorksheet("Market");
  const mh = market.addRow(["Tier", "Definition", "Value", "CAGR"]); styleHeader(mh);
  [
    ["TAM", report.market.tamLabel, report.market.tamValue, report.market.tamCagr],
    ["SAM", report.market.samLabel, report.market.samValue, report.market.samCagr],
    ["SOM", report.market.somLabel, report.market.somValue, report.market.somCagr],
  ].forEach((r) => { const row = market.addRow(r); row.eachCell((c) => c.border = ALL_BORDERS); });
  market.addRow([]);
  const gh = market.addRow(["Year", "TAM", "SAM"]); styleHeader(gh);
  report.market.growthChart.forEach((p) => { const row = market.addRow([p.year, p.tam, p.sam]); row.eachCell((c) => c.border = ALL_BORDERS); });
  // Growth formula (% change vs Y1)
  if (report.market.growthChart.length > 1) {
    market.addRow([]);
    const fh = market.addRow(["Metric", "Formula", "Result"]); styleHeader(fh);
    const startRow = gh.number + 1;
    const endRow = startRow + report.market.growthChart.length - 1;
    market.addRow(["TAM growth (start→end)", `=(B${endRow}-B${startRow})/B${startRow}`, ""]).getCell(2).numFmt = "0.0%";
    const lastRow = market.lastRow!;
    lastRow.getCell(3).value = { formula: `(B${endRow}-B${startRow})/B${startRow}` } as any;
    lastRow.getCell(3).numFmt = "0.0%";
  }
  autoWidth(market);

  // ---------- Financials (with formulas) ----------
  const fin = wb.addWorksheet("Financials");
  fin.addRow(["Currency", report.financials.currency]).font = { bold: true };
  fin.addRow([]);

  fin.addRow(["CapEx Items"]).font = { bold: true, color: { argb: PRIMARY } };
  const ch = fin.addRow(["Category", "Low", "High", "Mid (formula)", "Notes"]); styleHeader(ch);
  const capExStart = fin.lastRow!.number + 1;
  report.financials.capEx.forEach((c) => {
    const row = fin.addRow([c.category, c.low, c.high, null, c.notes]);
    row.getCell(4).value = { formula: `(B${row.number}+C${row.number})/2` } as any;
    row.eachCell((cell) => cell.border = ALL_BORDERS);
    [2, 3, 4].forEach((i) => row.getCell(i).numFmt = "#,##0");
  });
  const capExEnd = fin.lastRow!.number;
  const capTotal = fin.addRow(["TOTAL", null, null, null, ""]);
  capTotal.getCell(2).value = { formula: `SUM(B${capExStart}:B${capExEnd})` } as any;
  capTotal.getCell(3).value = { formula: `SUM(C${capExStart}:C${capExEnd})` } as any;
  capTotal.getCell(4).value = { formula: `SUM(D${capExStart}:D${capExEnd})` } as any;
  capTotal.font = { bold: true, color: { argb: PRIMARY } };
  [2, 3, 4].forEach((i) => capTotal.getCell(i).numFmt = "#,##0");

  fin.addRow([]);
  fin.addRow(["OpEx Items"]).font = { bold: true, color: { argb: PRIMARY } };
  const oh = fin.addRow(["Category", "Monthly", "Annual (formula)"]); styleHeader(oh);
  const opStart = fin.lastRow!.number + 1;
  report.financials.opEx.forEach((o) => {
    const row = fin.addRow([o.category, o.monthly, null]);
    row.getCell(3).value = { formula: `B${row.number}*12` } as any;
    row.eachCell((cell) => cell.border = ALL_BORDERS);
    row.getCell(2).numFmt = "#,##0"; row.getCell(3).numFmt = "#,##0";
  });
  const opEnd = fin.lastRow!.number;
  const opTotal = fin.addRow(["TOTAL", null, null]);
  opTotal.getCell(2).value = { formula: `SUM(B${opStart}:B${opEnd})` } as any;
  opTotal.getCell(3).value = { formula: `SUM(C${opStart}:C${opEnd})` } as any;
  opTotal.font = { bold: true, color: { argb: PRIMARY } };
  [2, 3].forEach((i) => opTotal.getCell(i).numFmt = "#,##0");

  fin.addRow([]);
  fin.addRow(["Revenue Scenarios"]).font = { bold: true, color: { argb: PRIMARY } };
  const sch = fin.addRow(["Scenario", "Probability", "Annual Revenue", "Subscribers Y1", "Break-even"]); styleHeader(sch);
  report.financials.scenarios.forEach((sc) => {
    const row = fin.addRow([sc.scenario, sc.probability, num(sc.annualRevenue), sc.subscribersYr1, sc.breakEven]);
    row.eachCell((c) => c.border = ALL_BORDERS);
    row.getCell(3).numFmt = "#,##0";
  });
  autoWidth(fin);

  // ---------- Sensitivity (interactive cells) ----------
  const sens = wb.addWorksheet("Sensitivity");
  sens.addRow(["Sensitivity model — edit blue cells"]).font = { bold: true, size: 14, color: { argb: PRIMARY } };
  sens.addRow([]);
  const baseRev = num(report.financials.scenarios.find((s) => s.scenario === "Base Case")?.annualRevenue) || num(report.financials.scenarios[0]?.annualRevenue) || 1_000_000;
  const baseOpex = report.financials.opEx.reduce((s, x) => s + (x.annual || 0), 0) || baseRev * 0.6;
  const baseCapex = report.financials.capExTotal.mid || (report.financials.capExTotal.low + report.financials.capExTotal.high) / 2 || baseRev * 0.3;

  const ih = sens.addRow(["Driver", "Multiplier"]); styleHeader(ih);
  const drivers = [["Revenue", 1], ["Costs", 1], ["CAC", 1], ["Conversion", 1], ["Adoption", 1]];
  drivers.forEach(([label, val]) => {
    const row = sens.addRow([label, val]);
    row.getCell(2).font = { color: { argb: "FF0000FF" }, bold: true };
    row.getCell(2).numFmt = "0%";
    row.eachCell((c) => c.border = ALL_BORDERS);
  });
  const driverStart = ih.number + 1;
  const revRow = driverStart;
  const costRow = driverStart + 1;
  const cacRow = driverStart + 2;
  const convRow = driverStart + 3;
  const adoptRow = driverStart + 4;

  sens.addRow([]);
  const bh = sens.addRow(["Base Case Inputs", "Value"]); styleHeader(bh);
  sens.addRow(["Revenue (annual)", baseRev]).getCell(2).numFmt = "#,##0";
  sens.addRow(["OpEx (annual)", baseOpex]).getCell(2).numFmt = "#,##0";
  sens.addRow(["CapEx", baseCapex]).getCell(2).numFmt = "#,##0";
  const baseRevRow = bh.number + 1;
  const baseOpexRow = bh.number + 2;
  const baseCapexRow = bh.number + 3;

  sens.addRow([]);
  const oh2 = sens.addRow(["Scenario Output", "Formula", "Value"]); styleHeader(oh2);
  const addCalc = (label: string, formula: string, fmt = "#,##0") => {
    const row = sens.addRow([label, formula, null]);
    row.getCell(3).value = { formula } as any;
    row.getCell(3).numFmt = fmt;
    row.getCell(3).font = { bold: true };
    row.eachCell((c) => c.border = ALL_BORDERS);
  };
  addCalc("Adjusted Revenue", `B${baseRevRow}*B${revRow}*B${convRow}*B${adoptRow}`);
  addCalc("Adjusted OpEx", `B${baseOpexRow}*B${costRow}*(0.7+0.3*B${cacRow})`);
  addCalc("Gross Profit", `C${oh2.number + 1}-C${oh2.number + 2}`);
  addCalc("Net Profit (Y1)", `C${oh2.number + 3}-B${baseCapexRow}*0.2`);
  addCalc("Payback (months)", `IFERROR(B${baseCapexRow}/(C${oh2.number + 3}/12),0)`, "0.0");
  addCalc("ROI Y1", `IFERROR(C${oh2.number + 4}/B${baseCapexRow},0)`, "0.0%");
  autoWidth(sens);

  // ---------- Risks ----------
  const risks = wb.addWorksheet("Risks");
  const rh = risks.addRow(["Risk", "Probability", "Impact", "Level", "Mitigation"]); styleHeader(rh);
  report.risks.forEach((r) => {
    const row = risks.addRow([r.name, r.probability, r.impact, r.level, r.mitigation]);
    row.eachCell((c) => c.border = ALL_BORDERS);
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    const lvlCell = row.getCell(4);
    lvlCell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: r.level === "High" ? "FFFCA5A5" : r.level === "Med" ? "FFFCD34D" : "FF86EFAC" },
    };
  });
  risks.getColumn(5).width = 60;
  autoWidth(risks);

  // ---------- Recommendations ----------
  const rec = wb.addWorksheet("Recommendations");
  rec.addRow(["Strategic Recommendations"]).font = { bold: true, color: { argb: PRIMARY } };
  report.recommendations.forEach((r, i) => { const row = rec.addRow([`${i + 1}.`, r]); row.getCell(2).alignment = { wrapText: true }; });
  rec.addRow([]);
  rec.addRow(["Next Steps"]).font = { bold: true, color: { argb: PRIMARY } };
  report.nextSteps.forEach((r, i) => { const row = rec.addRow([`${i + 1}.`, r]); row.getCell(2).alignment = { wrapText: true }; });
  rec.getColumn(2).width = 80;

  // Trigger download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { fileName: link.download, bytes: blob.size };
}
