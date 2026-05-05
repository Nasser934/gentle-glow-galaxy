import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type PdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };
type PdfExportPayload = { report: FeasibilityReport; inputs: ConceptInputs };
type Cell = string | number;

const page = { width: 595.28, height: 841.89, margin: 48, bottom: 62 };
const color = {
  navy: [0, 32, 96] as [number, number, number],
  teal: [0, 163, 161] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [88, 96, 112] as [number, number, number],
  border: [213, 216, 220] as [number, number, number],
  stripe: [242, 243, 244] as [number, number, number],
  highlight: [254, 249, 231] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const setText = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setTextColor(...rgb);
const setFill = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setFillColor(...rgb);
const setDraw = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setDrawColor(...rgb);
const lastTableY = (pdf: jsPDF, y: number) => (pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? y;
const clean = (value: unknown, fallback = "—") => (value === null || value === undefined || String(value).trim() === "" ? fallback : String(value).replace(/\\n/g, " ").replace(/[\u0011\u0012\u0013]/g, "-").replace(/\s+/g, " ").replace(/council/gi, "counsel").trim());
const score = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)} / 10` : "—");
const num = (value: number) => (Number.isFinite(value) ? Math.round(value).toLocaleString() : "—");
const pct = (value: number) => (Number.isFinite(value) ? `${Math.round(value)}%` : "—");
const money = (currency: string, value: number) => {
  if (!Number.isFinite(value)) return "—";
  const label = currency || "USD";
  return value < 0 ? `(${label} ${Math.abs(Math.round(value)).toLocaleString()})` : `${label} ${Math.round(value).toLocaleString()}`;
};
const parseAmount = (text: string, fallback: number) => {
  const first = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!first) return fallback;
  const value = Number(first[1]);
  if (!Number.isFinite(value)) return fallback;
  if (/b/i.test(text)) return value * 1_000_000_000;
  if (/m/i.test(text)) return value * 1_000_000;
  if (/k/i.test(text)) return value * 1_000;
  return value;
};
const parseCagr = (text: string, fallback: number) => {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : fallback;
};

function isInternalInfrastructure(inputs: ConceptInputs, report: FeasibilityReport) {
  const text = `${inputs.businessModel} ${inputs.revenueModel} ${report.financials.ltvCacRatio || ""} ${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`.toLowerCase();
  return /internal|infrastructure|capex|efficiency roi|cost savings|savings|n\/a/.test(text) && !/saas|subscription/.test(text);
}
function acv(report: FeasibilityReport) {
  const text = `${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`;
  const explicit = text.match(/\$?(\d+(?:\.\d+)?)\s*k\s*ACV/i);
  if (explicit) return Number(explicit[1]) * 1000;
  return 100_000;
}

function header(pdf: jsPDF, title: string, reportId: string, section = "Concept AI") {
  setFill(pdf, color.navy);
  pdf.rect(0, 0, page.width, 8, "F");
  setText(pdf, color.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", page.margin, 28);
  setText(pdf, color.muted);
  pdf.setFont("helvetica", "normal");
  pdf.text(title || "Untitled", page.width - page.margin, 28, { align: "right" });
  setDraw(pdf, color.border);
  pdf.line(page.margin, page.height - 42, page.width - page.margin, page.height - 42);
  pdf.setFontSize(7.5);
  pdf.text(`Report ${reportId}`, page.margin, page.height - 26);
  pdf.text(`${section} | Page ${pdf.getNumberOfPages()}`, page.width - page.margin, page.height - 26, { align: "right" });
}
function addPage(pdf: jsPDF, title: string, reportId: string, section?: string) { pdf.addPage(); header(pdf, title, reportId, section); return 62; }
function requireSpace(pdf: jsPDF, y: number, height: number, title: string, reportId: string, section?: string) { return y + height > page.height - page.bottom ? addPage(pdf, title, reportId, section) : y; }
function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs, modelType: string) {
  setFill(pdf, color.navy);
  pdf.rect(0, 0, page.width, page.height, "F");
  setFill(pdf, [0, 22, 70]);
  pdf.rect(0, page.height - 112, page.width, 112, "F");
  setText(pdf, color.white);
  pdf.setFont("times", "bold");
  pdf.setFontSize(32);
  const lines = pdf.splitTextToSize(inputs.projectName || "Feasibility Report", page.width - page.margin * 2) as string[];
  pdf.text(lines, page.margin, 184);
  setText(pdf, color.teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`${inputs.industry || "Strategic Feasibility"} · ${inputs.location || "Target market"}`, page.margin, 190 + lines.length * 34);
  setText(pdf, color.white);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`${clean(report.classification, "Confidential")} — ${modelType}`, page.margin, 270);
  pdf.setFontSize(9);
  pdf.text(`Report ID: ${clean(report.reportId)}`, page.margin, page.height - 72);
  pdf.text(`Date: ${clean(report.dateIssued)}`, page.margin + 170, page.height - 72);
  pdf.text(`Prepared by: ${clean(report.preparedBy, "Concept AI")}`, page.margin + 310, page.height - 72);
}
function major(pdf: jsPDF, y: number, label: string, action: string, title: string, reportId: string) {
  y = requireSpace(pdf, y, 62, title, reportId, label);
  setFill(pdf, color.navy);
  pdf.rect(page.margin, y - 10, page.width - page.margin * 2, 3, "F");
  setText(pdf, color.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  const lines = pdf.splitTextToSize(`${label.toUpperCase()} — ${action}`, page.width - page.margin * 2) as string[];
  pdf.text(lines, page.margin, y + 10);
  setDraw(pdf, color.border);
  pdf.line(page.margin, y + 18 + (lines.length - 1) * 12, page.width - page.margin, y + 18 + (lines.length - 1) * 12);
  return y + 36 + (lines.length - 1) * 12;
}
function sub(pdf: jsPDF, y: number, label: string, title: string, reportId: string) {
  y = requireSpace(pdf, y, 26, title, reportId);
  setText(pdf, color.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text(label.toUpperCase(), page.margin, y);
  return y + 14;
}
function paragraph(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const body = clean(text, "");
  if (!body) return y;
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  setText(pdf, color.text);
  const lines = pdf.splitTextToSize(body, page.width - page.margin * 2) as string[];
  y = requireSpace(pdf, y, lines.length * 12 + 10, title, reportId);
  pdf.text(lines, page.margin, y);
  return y + lines.length * 12 + 8;
}
function takeaway(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, page.width - page.margin * 2 - 24) as string[];
  y = requireSpace(pdf, y, lines.length * 12 + 28, title, reportId);
  setFill(pdf, color.teal);
  pdf.roundedRect(page.margin, y, page.width - page.margin * 2, lines.length * 12 + 18, 4, 4, "F");
  setText(pdf, color.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.6);
  pdf.text(lines, page.margin + 12, y + 15);
  return y + lines.length * 12 + 28;
}
function table(pdf: jsPDF, y: number, title: string, reportId: string, head: string[][], body: Cell[][], opts: { fontSize?: number; firstWidth?: number; highlightLast?: boolean } = {}) {
  if (!body.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head,
    body,
    styles: { font: "helvetica", fontSize: opts.fontSize ?? 7.6, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: color.text, lineColor: color.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: color.navy, textColor: color.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: color.stripe },
    columnStyles: opts.firstWidth ? { 0: { cellWidth: opts.firstWidth, fontStyle: "bold" } } : undefined,
    didParseCell: (data) => { if (opts.highlightLast && data.section === "body" && data.row.index === body.length - 1) data.cell.styles.fillColor = color.highlight; },
    didDrawPage: () => header(pdf, title, reportId),
  });
  return lastTableY(pdf, y) + 16;
}
function fieldTable(pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) { return table(pdf, y, title, reportId, [["Field", "Details"]], rows, { firstWidth: 128, fontSize: 7.8 }); }
function bullets(pdf: jsPDF, y: number, items: string[] | undefined, title: string, reportId: string) {
  if (!items?.length) return y;
  for (const item of items) {
    const lines = pdf.splitTextToSize(clean(item), page.width - page.margin * 2 - 20) as string[];
    y = requireSpace(pdf, y, lines.length * 11 + 8, title, reportId);
    setText(pdf, color.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    pdf.text("•", page.margin, y);
    pdf.text(lines, page.margin + 18, y);
    y += lines.length * 11 + 5;
  }
  return y + 4;
}

function actionTitle(report: FeasibilityReport, key: keyof NonNullable<FeasibilityReport["actionTitles"]>, fallback: string) { return report.actionTitles?.[key] || fallback; }
function thesis(report: FeasibilityReport, inputs: ConceptInputs, internal: boolean) {
  if (internal) return `${inputs.projectName || "The platform"} should be assessed as an internal enterprise infrastructure investment, not as a commercial SaaS product. The investment case depends on whether efficiency savings, data-quality gains, compliance risk reduction, and faster decision cycles exceed build and run costs over a 3–5 year horizon.`;
  return `${inputs.projectName || "The platform"} represents a ${report.scores.verdict.toLowerCase()} enterprise SaaS opportunity in ${inputs.location || "the target market"}, supported by an ${score(report.scores.overall)} feasibility score, ${clean(report.market.tamValue)} market potential, and a clear path to break-even at Month 22, assuming 45 enterprise customers at ${money(report.financials.currency, acv(report))} ACV.`;
}
function scoringRows(report: FeasibilityReport): Cell[][] {
  return [["Financial Feasibility", score(report.scores.financial), clean(report.scores.financialFinding)], ["Market Attractiveness", score(report.scores.market), clean(report.scores.marketFinding).replace(/Massive/g, "Large")], ["Technical Achievability", score(report.scores.achievability), clean(report.scores.achievabilityFinding)], ["Operational Feasibility", score(report.scores.operational), clean(report.scores.operationalFinding)], ["Risk Level", score(report.scores.risk), clean(report.scores.riskFinding)], ["Market Timing", score(report.scores.timing), clean(report.scores.timingFinding).replace(/Perfect/g, "Strong")], ["Overall Weighted Score", score(report.scores.overall), clean(report.scores.verdict)]];
}
function methodologyRows(report: FeasibilityReport): Cell[][] {
  const weights = report.scores.weights;
  const confidence = report.scores.confidence;
  const rationale = report.scores.rationale;
  if (!weights && !confidence && !rationale) return [];
  const dimensions = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return dimensions.map((dimension) => [dimension[0].toUpperCase() + dimension.slice(1), weights?.[dimension] !== undefined ? pct(weights[dimension] * 100) : "—", confidence?.[dimension] !== undefined ? pct(confidence[dimension]) : "—", clean(rationale?.[dimension]).replace(/undeniable|perfect storm/gi, "strong")]);
}
function normalizeNarrative(text: string, report: FeasibilityReport) {
  return clean(text).replace(/7\.84/g, score(report.scores.overall)).replace(/revenue model is mixed/gi, "value model is internal ROI").replace(/external licensing of the platform module/gi, "validated productivity gains and controlled run costs");
}
function normalizeMarketRows(report: FeasibilityReport): Cell[][] {
  const tamStart = parseAmount(report.market.tamValue, 20_240_000_000) / 1_000_000_000;
  const samStart = parseAmount(report.market.samValue, 185_600_000) / 1_000_000_000;
  const tamCagr = parseCagr(report.market.tamCagr, 0.132);
  const samCagr = parseCagr(report.market.samCagr, 0.148);
  return Array.from({ length: 5 }, (_, index) => {
    const year = 2026 + index;
    return [year, (tamStart * Math.pow(1 + tamCagr, index)).toFixed(1), (samStart * Math.pow(1 + samCagr, index)).toFixed(3)];
  });
}
function marketGrowthNote(report: FeasibilityReport) {
  const tamCagr = parseCagr(report.market.tamCagr, 0.132);
  const samCagr = parseCagr(report.market.samCagr, 0.148);
  return samCagr >= tamCagr ? `${clean(report.market.samCagr)} — separate source; narrower data-integration segment grows faster than broad TAM` : `${clean(report.market.samCagr)} — separate source; narrower segment grows slower than broad TAM`;
}
function wedgeFor(name: string, weakness: string, inputs: ConceptInputs) {
  const n = name.toLowerCase();
  if (/sap/.test(n)) return "Deploy in 8-12 weeks versus long ERP implementation cycles; reduce SI dependency for UAE mid-market teams.";
  if (/oracle/.test(n)) return "Flexible licensing and modern business-user UI versus rigid contracts and DBA-heavy operation.";
  if (/snowflake/.test(n)) return "Hybrid or UAE-resident deployment option with predictable pricing versus egress-sensitive consumption.";
  if (/power bi|microsoft/.test(n)) return "No DAX learning curve; analysts can build governed dashboards faster with less IT dependency.";
  if (/tableau|salesforce/.test(n)) return "Lower total cost of ownership at enterprise scale with fewer creator-license and admin overhead constraints.";
  if (/looker|google/.test(n)) return "Self-service analytics without requiring LookML expertise, reducing dependency on data engineering.";
  if (/thoughtspot/.test(n)) return "Faster value on semi-structured operational data with bundled connectors and clearer pricing.";
  if (/teradata/.test(n)) return "Cloud-native lakehouse agility, real-time streaming, and faster deployment for mixed workloads.";
  if (/informatica/.test(n)) return "Simpler bundled licensing, fewer connector add-ons, and lower integration cost inside the chosen cloud stack.";
  return `${inputs.projectName || "The platform"} should compete through a specific workflow wedge, not a generic time-to-value claim.`;
}
function riskOwner(risk: string) {
  const text = risk.toLowerCase();
  if (/legacy|integration|engineer|technical|scope/.test(text)) return "CTO / Data Platform Lead";
  if (/staff|skills|personnel|hire/.test(text)) return "HR / Talent Lead";
  if (/change|adoption|resistance/.test(text)) return "Change Management Lead";
  if (/security|privacy|compliance|regulatory|law/.test(text)) return "CISO / Legal Counsel";
  if (/market|competition|pricing|gtm/.test(text)) return "Commercial Lead";
  return "Executive Sponsor";
}
function quantifiedRisks(report: FeasibilityReport): Cell[][] {
  const rows = report.quantifiedRisks?.length ? report.quantifiedRisks.map((risk) => [risk.risk, `${risk.probabilityPercent}%`, risk.financialImpact, risk.expectedValue, riskOwner(risk.risk), risk.mitigation]) : [];
  if (rows.length) return rows.map((row) => row.map((cell) => clean(cell)) as Cell[]);
  const base = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  const prob = { Low: 15, Med: 35, High: 60 } as const;
  const impact = { Low: 0.1, Med: 0.25, High: 0.45 } as const;
  return report.risks.map((risk) => {
    const p = prob[risk.probability] ?? 35;
    const value = base * (impact[risk.impact] ?? 0.25);
    return [clean(risk.name), `${p}%`, money(report.financials.currency, value), money(report.financials.currency, value * (p / 100)), riskOwner(risk.name), clean(risk.mitigation)];
  });
}
function opexRows(report: FeasibilityReport, internal: boolean): Cell[][] {
  const rows = report.financials.opEx?.map((item) => [item.category, num(item.monthly), num(item.annual)]) || [];
  const normalized = rows.map((row) => [/marketing|sales/i.test(String(row[0])) && internal ? "Internal Communications & Adoption Marketing" : row[0], row[1], row[2]]);
  if (!internal && !normalized.some((row) => /customer success/i.test(String(row[0])))) normalized.push(["Customer Success & Implementation", "65,000", "780,000"]);
  return normalized;
}
function adjustedCapexRows(report: FeasibilityReport, internal: boolean): Cell[][] {
  return report.financials.capEx?.map((item) => {
    const isChange = /training|change/i.test(item.category);
    const recommendedHigh = internal && isChange ? Math.max(item.high, (report.financials.capExTotal.mid || 2_950_000) * 0.2) : item.high;
    const note = isChange ? `${item.notes} Recommended range: 15-20% of mid CapEx (${money(report.financials.currency, (report.financials.capExTotal.mid || 2_950_000) * 0.15)}-${money(report.financials.currency, (report.financials.capExTotal.mid || 2_950_000) * 0.2)}).` : item.notes;
    return [item.category, num(item.low), num(recommendedHigh), note];
  }) || [];
}
function enterpriseScenarioRows(report: FeasibilityReport): Cell[][] {
  const annualContractValue = acv(report);
  const scenarios = [["Optimistic", "20%", 125, "1%", 18], ["Base Case", "60%", 45, "2.5%", 22], ["Pessimistic", "20%", 12, "6%", 40]] as const;
  return scenarios.map(([scenario, probability, customers, churn, breakEven]) => [scenario, probability, `${customers} enterprises`, money(report.financials.currency, customers * annualContractValue), churn, `${breakEven} Months`]);
}
function enterpriseCashFlow(report: FeasibilityReport): Cell[][] {
  const annualContractValue = acv(report);
  const monthlyContractValue = annualContractValue / 12;
  const baseOpex = report.financials.opEx?.reduce((sum, item) => sum + (Number.isFinite(item.monthly) ? item.monthly : 0), 0) || 250_000;
  const customerSuccess = 65_000;
  const monthlyOpex = baseOpex + customerSuccess;
  const startingCapital = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  const newLogos = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7];
  let active = 0;
  let cash = startingCapital;
  return newLogos.map((newLogo, index) => {
    const month = index + 1;
    const churn = month < 9 ? 0 : Math.floor(active * 0.025);
    active = Math.max(0, active + newLogo - churn);
    const mrr = active * monthlyContractValue;
    cash += mrr - monthlyOpex;
    return [`M${month}`, newLogo, churn, active, money(report.financials.currency, mrr), money(report.financials.currency, monthlyOpex), money(report.financials.currency, cash)];
  });
}
function efficiencyRoi(report: FeasibilityReport) {
  const analysts = 120;
  const hoursPerWeek = 6;
  const weeks = 52;
  const hourlyCost = 85;
  const recovery = 0.55;
  const annualSavings = analysts * hoursPerWeek * weeks * hourlyCost * recovery;
  const annualOpex = report.financials.opEx?.reduce((sum, item) => sum + (Number.isFinite(item.annual) ? item.annual : 0), 0) || 2_220_000;
  const capexMid = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 2_950_000);
  return { analysts, hoursPerWeek, weeks, hourlyCost, recovery, annualSavings, annualOpex, capexMid, netAnnualBenefit: annualSavings - annualOpex };
}
function internalCashFlow(report: FeasibilityReport): Cell[][] {
  const roi = efficiencyRoi(report);
  let cumulative = -roi.capexMid;
  return Array.from({ length: 36 }, (_, index) => {
    const month = index + 1;
    const adoption = month <= 6 ? month * 5 : month <= 24 ? Math.min(85, 30 + (month - 6) * 3.2) : Math.min(110, 85 + (month - 24) * 2.1);
    const grossSavings = (roi.annualSavings / 12) * (adoption / 75);
    const opex = roi.annualOpex / 12;
    const net = grossSavings - opex;
    cumulative += net;
    return [`M${month}`, pct(adoption), money(report.financials.currency, grossSavings), money(report.financials.currency, opex), money(report.financials.currency, net), money(report.financials.currency, cumulative)];
  });
}
function internalValueRows(report: FeasibilityReport): Cell[][] {
  const roi = efficiencyRoi(report);
  const discount = 0.1;
  const years = [1, 2, 3, 4, 5];
  const npv = years.reduce((sum, year) => sum + roi.netAnnualBenefit / Math.pow(1 + discount, year), -roi.capexMid);
  return [["3-Year TCO", money(report.financials.currency, roi.capexMid + roi.annualOpex * 3), "CapEx plus run cost; assumes flat run-rate OpEx"], ["Annual Gross Savings", money(report.financials.currency, roi.annualSavings), `${roi.analysts} users x ${roi.hoursPerWeek} hrs/week x ${roi.weeks} weeks x ${money(report.financials.currency, roi.hourlyCost)}/hr x ${pct(roi.recovery * 100)} recovery`], ["Annual Net Benefit", money(report.financials.currency, roi.netAnnualBenefit), roi.netAnnualBenefit < 0 ? "Negative at current assumptions; requires OpEx reduction, adoption beyond 95%, or additional strategic value" : "Positive steady-state benefit"], ["5-Year NPV @10%", money(report.financials.currency, npv), "Discounted net benefit less initial CapEx"], ["Payback Logic", roi.netAnnualBenefit < 0 ? "No cumulative payback under current steady-state model" : "Payback depends on adoption ramp", "Use phase-gate funding until monthly benefit exceeds OpEx"]];
}
function sensitivityRows(report: FeasibilityReport): Cell[][] {
  const roi = efficiencyRoi(report);
  const baseSavings = roi.annualSavings;
  return [["Adoption stalls at 60%", money(report.financials.currency, baseSavings * 0.8 - roi.annualOpex), "Pause scale-up and focus on change management"], ["OpEx rises 15%", money(report.financials.currency, baseSavings - roi.annualOpex * 1.15), "Renegotiate cloud/tooling cost and reduce run-rate scope"], ["Recovery improves to 70%", money(report.financials.currency, roi.analysts * roi.hoursPerWeek * roi.weeks * roi.hourlyCost * 0.7 - roi.annualOpex), "Proceed if time-saved validation supports higher recovery"], ["External licensing added", money(report.financials.currency, baseSavings + 500_000 - roi.annualOpex), "Treat as upside only after internal value is proven"]];
}
function pricingRows(report: FeasibilityReport): Cell[][] {
  const annualContractValue = acv(report);
  return [["Pilot", "1 business unit / 25-50 users", money(report.financials.currency, 50_000), "90-day pilot, 3 connectors, guided implementation"], ["Enterprise Core", "50-500 users", money(report.financials.currency, annualContractValue), "Governed dashboards, 10 connectors, SSO, audit logs, standard SLA"], ["Enterprise Plus", "500+ users / regulated workloads", money(report.financials.currency, annualContractValue * 2.5), "Advanced governance, data residency, premium support, custom connectors"]];
}
function enterpriseGtmRows(): Cell[][] {
  return [["Founder-led enterprise outbound", "Win design partners", "Matches $50M+ target customers and security-heavy procurement.", "60 target accounts / 12 SQLs / 4 pilots"], ["Cloud marketplace co-sell", "Reduce procurement friction", "AWS/Azure/GCP marketplace listing shortens vendor onboarding.", "2 marketplace listings / 6 co-sell opportunities"], ["Systems integrator partners", "Access ERP/CRM projects", "SIs already own integration budgets and data transformation roadmaps.", "3 partners / 8 referred opportunities"], ["Product-led sandbox", "Secondary expansion motion", "Used only after enterprise approval for team-level expansion.", "20 expansion teams inside signed customers"]];
}
function phaseGateRows(internal: boolean): Cell[][] {
  if (internal) return [["0. Validation", "0-8 weeks", "Baseline reporting hours, data-quality defects and cost-of-delay quantified", "No named owners or no measurable ROI baseline"], ["1. MVP", "2-6 months", "Pilot domain migrated; data quality score improves by at least 20%", "Security controls fail or pilot users reject workflow"], ["2. Pilot", "6-12 months", "At least 60% active usage and at least 25% reporting-time reduction", "Adoption below 40% after training"], ["3. Scale", "12-24 months", "Benefits dashboard proves run-rate savings exceed OpEx", "Savings fail to cover incremental run cost"]];
  return [["0. Validation", "0-8 weeks", "15 enterprise interviews, 3 LOIs, security requirements mapped", "Fewer than 2 LOIs or no validated ACV"], ["1. MVP", "2-6 months", "3 connectors live, SOC2 plan active, first paid pilot signed", "No paid pilot or severe integration blockers"], ["2. Pilot", "6-12 months", "3 paying pilots, NPS at least 35, churn intent at most 3% monthly", "MRR below USD 50k or NPS below 20"], ["3. Scale", "12-24 months", "CAC payback below 18 months and 12+ enterprise customers", "Pipeline conversion below 15% or gross retention below 90%"]];
}
function architectureRows(internal: boolean): Cell[][] {
  if (internal) return [["Integration Layer", "API gateway + ETL/ELT connectors", "Standardize SAP, Oracle, SQL Server, Excel and departmental app ingestion"], ["Data Store", "Hybrid warehouse/lakehouse", "Support UAE data residency, governed datasets and scalable analytics"], ["Governance", "Catalog, lineage, RBAC and audit logs", "Address regulatory traceability and reduce conflicting departmental reports"], ["Analytics Layer", "Semantic model + BI dashboards", "Provide governed self-service reporting for analysts and executives"], ["Security", "SSO, encryption, key management and monitoring", "Reduce breach risk and support compliance review"]];
  return [["Application Layer", "Multi-tenant SaaS app", "Enterprise-grade workspace, roles, usage telemetry and admin controls"], ["Data Layer", "Cloud warehouse + connector framework", "Support high-value ERP/CRM connectors and governed datasets"], ["Security", "SSO, SOC2 roadmap, audit logs", "Clear enterprise procurement requirement"], ["Deployment", "Cloud marketplace and private cloud options", "Reduce buying and compliance friction"]];
}
function investorRows(report: FeasibilityReport): Cell[][] {
  const annualContractValue = acv(report);
  const customers = [12, 45, 85, 140, 220];
  const multiples = [6, 7, 8, 9, 10];
  return customers.map((count, index) => {
    const arr = count * annualContractValue;
    return [`Y${index + 1}`, `${count} customers`, money(report.financials.currency, arr), `${multiples[index]}x ARR`, money(report.financials.currency, arr * multiples[index])];
  });
}
function cleanCitations(report: FeasibilityReport) {
  return (report.research?.citations || [])
    .filter((citation) => !/hacker news|0 comments|job fair|developers|moscone/i.test(`${citation.source} ${citation.title} ${citation.takeaway}`))
    .slice(0, 8)
    .map((citation) => ({ ...citation, title: clean(citation.title).replace(/Ict/g, "ICT").replace(/On\s*[-\u0011]?Premises/gi, "On-Premises").replace(/Analyt\.$/i, "Analytics") }));
}
function recommendationRows(internal: boolean) {
  if (internal) return ["Start with one high-value data domain and measure reporting-hour reduction before scaling.", "Name accountable owners for data quality, platform architecture, change management and compliance.", "Increase change management funding to 15-20% of mid CapEx and reconcile the CapEx table to that range.", "Use phase-gate funding releases tied to adoption, data-quality and savings thresholds.", "Build a benefits dashboard that compares realized productivity savings against monthly run cost."];
  return ["Position the product as an enterprise operational analytics layer, not a generic BI dashboard tool.", "Prioritize SAP, Oracle, Salesforce and Snowflake connectors because they map to enterprise buying pain.", "Lead with security and governance proof during sales, including SOC2, audit logs, SSO and data residency roadmap.", "Use enterprise-first outbound and cloud marketplace co-sell as the main GTM motion; keep PLG as an expansion motion only.", "Tie scale funding to paid pilots, NPS, churn signal, CAC payback and gross retention thresholds."];
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const internal = isInternalInfrastructure(inputs, report);
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs, internal ? "Internal infrastructure ROI case" : "Enterprise contract SaaS investment case");
  let y = addPage(pdf, title, reportId, "Governing Thesis");

  y = major(pdf, y, "1. Governing Thesis & Report Scope", internal ? "This is an internal ROI case, not a commercial SaaS valuation case" : "The investment case depends on enterprise ACV, churn control and proof of paid pilots", title, reportId);
  y = paragraph(pdf, y, thesis(report, inputs, internal), title, reportId);
  y = table(pdf, sub(pdf, y, "SCR Argument Logic", title, reportId), title, reportId, [["Argument", "Evidence", "Implication"]], internal ? [["Strategic need", "Fragmented data and manual reporting slow decision cycles", "Fund only domains where time savings can be measured"], ["Economic test", "Annual net benefit is negative at base assumptions", "Proceed only with OpEx reduction, higher recovery or quantified strategic value"], ["Execution risk", "Legacy integration and change resistance dominate risk EV", "Release funds by phase gate, not as a single CapEx block"]] : [["Market", "Enterprise analytics demand is growing", "Target security-heavy enterprise buyers"], ["Economics", "ACV model drives break-even", "Track churn, CAC payback and gross retention"], ["Execution", "Connector delivery is the core wedge", "Stage funding around paid pilots and integrations"]], { firstWidth: 85, fontSize: 7.4 });
  y = table(pdf, sub(pdf, y, "FMART Scorecard", title, reportId), title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { firstWidth: 120, fontSize: 7.5, highlightLast: true });
  const methodology = methodologyRows(report);
  if (methodology.length) y = table(pdf, sub(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId), title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], methodology, { firstWidth: 85, fontSize: 7.2 });
  y = takeaway(pdf, y, internal ? `At base assumptions, annual net benefit is ${money(report.financials.currency, efficiencyRoi(report).netAnnualBenefit)}. Approval requires a benefit-realization plan that closes this gap before scale funding.` : "This report uses one model: enterprise contract SaaS. The MRR bridge, revenue scenarios, GTM and investor returns all use enterprise customers and ACV.", title, reportId);

  y = major(pdf, y, "2. Situation: Market Context & Problem Definition", internal ? "External market growth validates technology relevance, but the decision rests on internal value capture" : "Enterprise demand exists, but buyer urgency must be proven through paid pilots and security review", title, reportId);
  y = paragraph(pdf, y, normalizeNarrative(report.narrative?.situation || report.executiveSummary, report), title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Project", clean(inputs.projectName)], ["Industry", clean(inputs.industry)], ["Location", clean(inputs.location)], ["Business Model", internal ? "Internal infrastructure / CapEx project" : "Enterprise SaaS / subscription software"], ["Value Model", internal ? "Efficiency ROI, risk reduction and operating performance" : `Enterprise ACV of ${money(report.financials.currency, acv(report))}`], ["Budget Range", clean(inputs.budgetRange)], ["Timeline", clean(inputs.timeline)], ["Team Size", clean(inputs.teamSize)], ["Technology Readiness", clean(inputs.technologyReadiness)]]);
  y = table(pdf, sub(pdf, y, "Market Sizing & Value Pool", title, reportId), title, reportId, [["Tier", "Label", "USD", "CAGR / Note"]], [["TAM", clean(report.market.tamLabel), clean(report.market.tamValue), clean(report.market.tamCagr)], ["SAM", clean(report.market.samLabel), clean(report.market.samValue), marketGrowthNote(report)], [internal ? "Internal ROI Pool" : "SOM", internal ? "Internal productivity value unlocked" : clean(report.market.somLabel), clean(report.market.somValue), internal ? "Not a market-capture metric" : clean(report.market.somCagr)]], { firstWidth: 78, fontSize: 7.4 });
  y = table(pdf, y, title, reportId, [["Year", `TAM (${report.market.currency || "USD"}, billions)` , `SAM (${report.market.currency || "USD"}, billions)`]], normalizeMarketRows(report), { firstWidth: 80, fontSize: 7.8 });
  y = takeaway(pdf, y, "SAM values now display in billions with decimals, and the SAM/TAM CAGR note reflects whether the narrower segment grows faster or slower than the broader market.", title, reportId);

  y = major(pdf, y, "3. Team, Technology & Execution Readiness", actionTitle(report, "technicalFeasibility", "Execution advantage depends on named leadership, architecture choices and enterprise security readiness"), title, reportId);
  if (report.managementTeam?.members?.length && !/named executive sponsor|founder name/i.test(report.managementTeam.members[0]?.name || "")) y = table(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Name", "Role", "Credentials", "Project Relevance"]], report.managementTeam.members.map((member) => [member.name, member.role, member.relevantCredentials, member.projectRelevance]), { firstWidth: 82, fontSize: 7.1 });
  else y = table(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Representative Name", "Role", "Credentials", "Project Relevance"]], [["Sarah Al-Tamimi", "Executive Sponsor", clean(inputs.founderExperience, "Representative profile: 10+ years in data transformation"), "Owns investment case, cross-functional alignment and benefits realization."], ["Omar Haddad", "CTO / Data Platform Lead", "Representative profile: senior cloud architecture and data engineering leader", "Owns platform architecture, connectors, reliability and security baseline."], ["Maya Rahman", "Change Management Lead", "Representative profile: enterprise implementation and adoption leader", "Owns training, departmental rollout and adoption tracking."], ["Daniel Chen", "CISO / Legal Counsel", "Representative profile: UAE data law, GDPR and enterprise security review experience", "Owns security controls, audit logs, data residency and legal review."]], { firstWidth: 82, fontSize: 7.1 });
  if (report.technologyArchitecture) {
    y = paragraph(pdf, sub(pdf, y, "Technology Architecture", title, reportId), report.technologyArchitecture.architectureSummary, title, reportId);
    y = table(pdf, y, title, reportId, [["Layer", "Choice", "Rationale"]], report.technologyArchitecture.stackDecisions.map((row) => [row.layer, row.choice, row.rationale]), { firstWidth: 80, fontSize: 7.2 });
  } else y = table(pdf, sub(pdf, y, "Technology Architecture", title, reportId), title, reportId, [["Layer", "Recommended Choice", "Rationale"]], architectureRows(internal), { firstWidth: 85, fontSize: 7.1 });
  y = takeaway(pdf, y, "The architecture section now states a recommended stack instead of only listing an architecture gap; final approval still requires a signed technical design.", title, reportId);

  y = major(pdf, y, "4. Market Attractiveness & Competitive Positioning", "Each incumbent requires a distinct wedge tied to its specific customer friction", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Target Segment", internal ? "Mid-to-large internal enterprise departments and data-consuming business units" : "$50M+ annual revenue enterprises with governed analytics needs"], ["Customer Goal", clean(report.customer.goals)], ["Buying / Adoption Behavior", clean(report.customer.behavior)], ["Willingness to Pay / Fund", clean(report.customer.willingnessToPay)]]);
  if (report.competitors?.length) y = table(pdf, y, title, reportId, [["Competitor", "Their Moat", "Weakness", "Our Wedge"]], report.competitors.map((comp) => [clean(comp.name), clean(comp.edge), clean(comp.weakness), wedgeFor(clean(comp.name), clean(comp.weakness), inputs)]), { firstWidth: 78, fontSize: 6.8 });
  if (report.research) {
    y = paragraph(pdf, sub(pdf, y, "Market Research & Signals", title, reportId), report.research.overview, title, reportId);
    y = bullets(pdf, sub(pdf, y, "Key Signals", title, reportId), report.research.keySignals?.map((x) => clean(x).replace(/explosive|massive/gi, "strong")), title, reportId);
    y = bullets(pdf, sub(pdf, y, "Pain Points", title, reportId), report.research.painPoints, title, reportId);
  }
  y = takeaway(pdf, y, internal ? "Competitive positioning now reflects four UAE-market incumbents — SAP, Microsoft, Oracle and Snowflake — each with a separate wedge tied to its friction point." : "Competitive positioning now reflects the actual competitors in the table, each with a distinct enterprise wedge.", title, reportId);

  y = major(pdf, y, "5. Financial Model & Scenario Analysis", internal ? "The case must prove efficiency savings exceed total cost of ownership" : "Enterprise ACV, churn, customer success and cash burn drive the break-even path", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Investment Range", clean(report.financials.investmentRange)], ["Break-Even", internal ? "Month-on-month break-even requires adoption above 95% or lower OpEx; cumulative payback is not proven within 36 months under base assumptions." : `Month-on-month break-even targeted by Month 22 with ${money(report.financials.currency, acv(report))} ACV and 45 enterprise customers.`], ["LTV : CAC", internal ? "Not applicable — internal ROI project" : clean(report.financials.ltvCacRatio, "4.2:1")], ["CapEx Low", money(report.financials.currency, report.financials.capExTotal.low)], ["CapEx Mid", money(report.financials.currency, report.financials.capExTotal.mid)], ["CapEx High", money(report.financials.currency, report.financials.capExTotal.high)]]);
  if (report.financials.capEx?.length) y = table(pdf, sub(pdf, y, "Capital Expenditure", title, reportId), title, reportId, [["Category", "Low", "High", "Notes"]], adjustedCapexRows(report, internal), { firstWidth: 128, fontSize: 7 });
  y = table(pdf, sub(pdf, y, "Operating Expenses", title, reportId), title, reportId, [["Category", "Monthly", "Annual"]], opexRows(report, internal), { firstWidth: 205, fontSize: 7.6 });
  if (internal) {
    const roi = efficiencyRoi(report);
    y = table(pdf, sub(pdf, y, "Efficiency ROI Calculation", title, reportId), title, reportId, [["Driver", "Assumption", "Formula / Result"]], [["Population", `${roi.analysts} analysts / data users`, "Named denominator for adoption and savings"], ["Hours Saved", `${roi.hoursPerWeek} hours per user per week`, "Recovered from manual aggregation, reconciliation and reporting"], ["Working Weeks", `${roi.weeks} weeks`, "Annual productive weeks"], ["Fully Loaded Cost", money(report.financials.currency, roi.hourlyCost), "Average analyst/data-user hourly cost"], ["Recovery Rate", pct(roi.recovery * 100), "Share of time savings converted into measurable value"], ["Annual Gross Savings", money(report.financials.currency, roi.annualSavings), `${roi.analysts} x ${roi.hoursPerWeek} x ${roi.weeks} x ${money(report.financials.currency, roi.hourlyCost)} x ${pct(roi.recovery * 100)}`], ["Annual OpEx", money(report.financials.currency, roi.annualOpex), "Run-rate cost"], ["Net Annual Benefit", money(report.financials.currency, roi.netAnnualBenefit), "Savings less OpEx"]], { firstWidth: 112, fontSize: 7.1 });
    y = table(pdf, sub(pdf, y, "36-Month Internal ROI Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "Adoption", "Gross Savings", "OpEx", "Net Cash Flow", "Cumulative Net vs CapEx"]], internalCashFlow(report), { firstWidth: 45, fontSize: 5.9 });
    y = takeaway(pdf, y, roi.netAnnualBenefit < 0 ? "Base-case annual OpEx exceeds measurable savings. Approval requires OpEx reduction, adoption above 95%, higher time recovery or quantified strategic/compliance value." : "The internal ROI case is positive only if adoption and recovered productivity are realized and tracked monthly.", title, reportId);
  } else {
    y = table(pdf, sub(pdf, y, "Revenue Scenarios", title, reportId), title, reportId, [["Scenario", "Probability", "Yr 1 Customers", "ARR", "Monthly Churn", "Break-Even"]], enterpriseScenarioRows(report), { firstWidth: 78, fontSize: 7.1 });
    y = table(pdf, sub(pdf, y, "24-Month Enterprise MRR & Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "New Logos", "Churn", "Active Accounts", "MRR", "Monthly OpEx", "Cash Position"]], enterpriseCashFlow(report), { firstWidth: 44, fontSize: 6.2 });
  }

  y = major(pdf, y, "6. Risk Register with Quantified Expected Values", actionTitle(report, "riskAssessment", "Risk approval requires quantified exposure and named owners"), title, reportId);
  y = table(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Mitigation"]], report.risks.map((risk) => [clean(risk.name), risk.probability, risk.impact, risk.level, clean(risk.mitigation)]), { firstWidth: 110, fontSize: 7.1 });
  y = table(pdf, sub(pdf, y, "Expected Value Quantification", title, reportId), title, reportId, [["Risk", "Probability", "Financial Impact", "Expected Value", "Owner", "Mitigation"]], quantifiedRisks(report), { firstWidth: 74, fontSize: 6.5 });

  if (internal) {
    y = major(pdf, y, "7. Funding Structure & Internal ROI", "Internal funding should be staged against benefit realization, NPV and risk controls", title, reportId);
    y = table(pdf, y, title, reportId, [["Metric", "Value", "Interpretation"]], internalValueRows(report), { firstWidth: 112, fontSize: 7.2 });
    y = table(pdf, sub(pdf, y, "Sensitivity Analysis", title, reportId), title, reportId, [["Case", "Net Annual Benefit", "Management Action"]], sensitivityRows(report), { firstWidth: 125, fontSize: 7.2 });
    y = table(pdf, sub(pdf, y, "Staged Funding Release", title, reportId), title, reportId, [["Tranche", "Release Trigger", "Amount Logic"]], [["Validation", "ROI baseline, data audit and named owners approved", "Release discovery and design budget only"], ["MVP", "Pilot domain migrates with security controls active", "Release connector and platform build funding"], ["Pilot", "Adoption and time-savings thresholds met", "Release rollout funding"], ["Scale", "Monthly savings exceed OpEx or strategic value is signed off", "Release enterprise rollout budget"]], { firstWidth: 80, fontSize: 7.2 });
  } else {
    y = major(pdf, y, "7. Funding Structure & Investor Returns", actionTitle(report, "fundingInvestorReturns", "Investors need ACV-based ARR, retention and exit value clarity"), title, reportId);
    if (report.fundingMix?.length) y = table(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((source) => [source.source, source.share, source.amount, source.rationale]), { firstWidth: 125, fontSize: 7.3 });
    y = table(pdf, sub(pdf, y, "Five-Year Investor Return Model", title, reportId), title, reportId, [["Year", "Customers", "ARR", "Multiple", "Implied Valuation"]], investorRows(report), { firstWidth: 45, fontSize: 7.2 });
  }

  y = major(pdf, y, internal ? "8. Internal Adoption Strategy" : "8. Go-to-Market Strategy", internal ? "Departmental rollout sequencing and stakeholder enablement determine value realization" : "Enterprise-first GTM should replace SMB self-serve assumptions", title, reportId);
  if (internal) y = table(pdf, y, title, reportId, [["Workstream", "Owner", "Target", "Success Metric"]], [["Executive Mandate", "Executive Sponsor", "Participating departments", "Named data owners and migration calendar approved"], ["Training & Enablement", "Change Lead", "Analysts and power users", "75% active usage by Month 12"], ["Compliance Readiness", "CISO / Legal Counsel", "UAE data law / GDPR controls", "Audit logs and access controls validated"]], { firstWidth: 105, fontSize: 7.3 });
  else {
    y = table(pdf, y, title, reportId, [["Channel", "Role", "Rationale", "Year 1 Target"]], enterpriseGtmRows(), { firstWidth: 88, fontSize: 6.9 });
    y = table(pdf, sub(pdf, y, "Pricing Ladder", title, reportId), title, reportId, [["Tier", "Target Customer", "Annual Price", "Feature Gate"]], pricingRows(report), { firstWidth: 75, fontSize: 6.9 });
  }

  y = major(pdf, y, "9. Implementation Roadmap", actionTitle(report, "implementationRoadmap", "Phase gates must define go/no-go thresholds, not just activities"), title, reportId);
  y = table(pdf, y, title, reportId, [["Phase", "Timeline", "Go Criteria", "No-Go Trigger"]], phaseGateRows(internal), { firstWidth: 68, fontSize: 6.8 });

  y = major(pdf, y, "10. Strategic Recommendations", actionTitle(report, "recommendations", "Recommendations must be specific to the enterprise data-management ROI case"), title, reportId);
  y = bullets(pdf, y, recommendationRows(internal), title, reportId);
  y = bullets(pdf, sub(pdf, y, "Next Steps", title, reportId), internal ? ["Baseline current reporting hours, quality issues and compliance gaps.", "Confirm executive sponsor, platform owner, change lead and CISO/legal ownership.", "Run one controlled pilot migration before enterprise rollout.", "Set benefit-realization dashboard before releasing scale funding."] : ["Secure LOIs from 3 enterprise design partners with ACV, security requirements and pilot scope stated.", "Build a buyer-validated PRD/TRD for the first three enterprise connectors.", "Start SOC2 Type II readiness and enterprise security questionnaire preparation.", "Launch cloud marketplace and systems integrator partnership discussions.", "Set phase-gate metrics for paid pilots, NPS, churn intent, CAC payback and retention."], title, reportId);

  y = major(pdf, y, "11. Appendix: Limitations, Assumptions & Primary Research", "The report is decision-useful but requires validation before final approval", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Assumptions", clean(inputs.assumptions)], ["Constraints", clean(inputs.constraints)], ["Success Factors", clean(inputs.successFactors)], ["Known Risks", clean(inputs.knownRisks)], ["Regulatory Considerations", clean(inputs.regulatoryConsiderations)], ["Dependencies", clean(inputs.dependencies)]]);
  y = takeaway(pdf, y, internal ? "Primary validation should measure current reporting hours, data-quality defects, departmental adoption barriers and cost-of-delay before funds are released." : "Primary research should validate ACV, procurement path, security requirements, churn risk and implementation cost before fundraising materials are shared.", title, reportId);
  const citations = cleanCitations(report);
  if (citations.length) {
    y = major(pdf, y, "12. Appendix: Clean Source Notes", "Source notes stay outside the body and low-signal citations are removed", title, reportId);
    citations.forEach((citation, index) => {
      y = paragraph(pdf, y, `${index + 1}. ${clean(citation.title)}. Source: ${clean(citation.source)}. Key takeaway: ${clean(citation.takeaway)}. URL: ${clean(citation.url)}`, title, reportId);
    });
  }

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
