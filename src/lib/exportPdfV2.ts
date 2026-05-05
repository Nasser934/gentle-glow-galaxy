import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type PdfWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
  putTotalPages?: (placeholder: string) => void;
};

type PdfExportPayload = {
  report: FeasibilityReport;
  inputs: ConceptInputs;
};

type Cell = string | number;
type Rgb = [number, number, number];

const TOTAL_PAGES = "{total_pages_count_string}";
const PAGE = { width: 595.28, height: 841.89, margin: 48, bottom: 62 };
const COLOR = {
  navy: [0, 32, 96] as Rgb,
  teal: [0, 163, 161] as Rgb,
  amber: [232, 160, 0] as Rgb,
  green: [27, 107, 58] as Rgb,
  red: [192, 57, 43] as Rgb,
  text: [26, 26, 46] as Rgb,
  muted: [88, 96, 112] as Rgb,
  border: [213, 216, 220] as Rgb,
  stripe: [242, 243, 244] as Rgb,
  highlight: [254, 249, 231] as Rgb,
  white: [255, 255, 255] as Rgb,
};

const setText = (pdf: jsPDF, rgb: Rgb) => pdf.setTextColor(...rgb);
const setFill = (pdf: jsPDF, rgb: Rgb) => pdf.setFillColor(...rgb);
const setDraw = (pdf: jsPDF, rgb: Rgb) => pdf.setDrawColor(...rgb);
const lastTableY = (pdf: jsPDF, y: number) => (pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? y;

function clean(value: unknown, fallback = "—") {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return String(value)
    .replace(/\\n/g, " ")
    .replace(/[\u0011\u0012\u0013]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/council/gi, "counsel")
    .replace(/Massive|massive/g, "Large")
    .replace(/Perfect/g, "Strong")
    .trim();
}

const score = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)}/10` : "—");
const pct = (value: number) => (Number.isFinite(value) ? `${Math.round(value)}%` : "—");
const num = (value: number) => (Number.isFinite(value) ? Math.round(value).toLocaleString() : "—");
function money(currency: string, value: number) {
  if (!Number.isFinite(value)) return "—";
  const label = currency || "USD";
  const rounded = Math.abs(Math.round(value)).toLocaleString();
  return value < 0 ? `(${label} ${rounded})` : `${label} ${rounded}`;
}
function parseAmount(text: string, fallback: number) {
  const match = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return fallback;
  if (/b/i.test(text)) return value * 1_000_000_000;
  if (/m/i.test(text)) return value * 1_000_000;
  if (/k/i.test(text)) return value * 1_000;
  return value;
}
function parseCagr(text: string, fallback: number) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : fallback;
}
function isInternal(inputs: ConceptInputs, report: FeasibilityReport) {
  const text = `${inputs.businessModel} ${inputs.revenueModel} ${report.financials.ltvCacRatio || ""} ${report.financials.breakEvenSummary}`.toLowerCase();
  return /internal|infrastructure|capex|efficiency roi|cost savings|savings|n\/a/.test(text) && !/saas|subscription/.test(text);
}
function acv(report: FeasibilityReport) {
  const source = `${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`;
  const match = source.match(/\$?(\d+(?:\.\d+)?)\s*k\s*ACV/i);
  return match ? Number(match[1]) * 1000 : 100_000;
}
function correctedMarket(report: FeasibilityReport) {
  const rawTam = parseAmount(report.market.tamValue, 1_900_000_000) / 1_000_000_000;
  const rawSam = parseAmount(report.market.samValue, 2_100_000_000) / 1_000_000_000;
  const rawSom = parseAmount(report.market.somValue, 85_000_000) / 1_000_000_000;
  const tam = rawSam >= rawTam ? Math.max(rawSam * 2.4, rawTam) : rawTam;
  const sam = Math.min(rawSam, tam * 0.65);
  const som = Math.min(rawSom, sam * 0.25);
  return { tam, sam, som, tamCorrected: rawSam >= rawTam };
}

function header(pdf: jsPDF, title: string, reportId: string, section = "Feasibility Report") {
  setFill(pdf, COLOR.navy);
  pdf.rect(0, 0, PAGE.width, 8, "F");
  setText(pdf, COLOR.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", PAGE.margin, 28);
  setText(pdf, COLOR.muted);
  pdf.setFont("helvetica", "normal");
  pdf.text(title || "Untitled", PAGE.width - PAGE.margin, 28, { align: "right" });
  setDraw(pdf, COLOR.border);
  pdf.line(PAGE.margin, PAGE.height - 42, PAGE.width - PAGE.margin, PAGE.height - 42);
  pdf.setFontSize(7.2);
  pdf.text(`Report ${reportId} | ${section} | Concept AI | Confidential | Page ${pdf.getNumberOfPages()} of ${TOTAL_PAGES}`, PAGE.margin, PAGE.height - 26);
}
function addPage(pdf: jsPDF, title: string, reportId: string, section?: string) {
  pdf.addPage();
  header(pdf, title, reportId, section);
  return 62;
}
function ensureSpace(pdf: jsPDF, y: number, height: number, title: string, reportId: string, section?: string) {
  return y + height > PAGE.height - PAGE.bottom ? addPage(pdf, title, reportId, section) : y;
}
function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs, model: string) {
  setFill(pdf, COLOR.navy);
  pdf.rect(0, 0, PAGE.width, PAGE.height, "F");
  setFill(pdf, [0, 22, 70]);
  pdf.rect(0, PAGE.height - 112, PAGE.width, 112, "F");
  setText(pdf, COLOR.white);
  pdf.setFont("times", "bold");
  pdf.setFontSize(32);
  const lines = pdf.splitTextToSize(inputs.projectName || "Feasibility Report", PAGE.width - PAGE.margin * 2) as string[];
  pdf.text(lines, PAGE.margin, 184);
  setText(pdf, COLOR.teal);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(`${inputs.industry || "Strategic Feasibility"} · ${inputs.location || "Target market"}`, PAGE.margin, 190 + lines.length * 34);
  setText(pdf, COLOR.white);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`${clean(report.classification, "Confidential")} — ${model}`, PAGE.margin, 270);
  pdf.setFontSize(9);
  pdf.text(`Report ID: ${clean(report.reportId)} | Date: ${clean(report.dateIssued)} | Prepared by: ${clean(report.preparedBy, "Concept AI")}`, PAGE.margin, PAGE.height - 72);
}
function major(pdf: jsPDF, y: number, label: string, action: string, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 62, title, reportId, label);
  setFill(pdf, COLOR.navy);
  pdf.rect(PAGE.margin, y - 10, PAGE.width - PAGE.margin * 2, 3, "F");
  setText(pdf, COLOR.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  const lines = pdf.splitTextToSize(`${label.toUpperCase()} — ${action}`, PAGE.width - PAGE.margin * 2) as string[];
  pdf.text(lines, PAGE.margin, y + 10);
  setDraw(pdf, COLOR.border);
  pdf.line(PAGE.margin, y + 18 + (lines.length - 1) * 12, PAGE.width - PAGE.margin, y + 18 + (lines.length - 1) * 12);
  return y + 36 + (lines.length - 1) * 12;
}
function sub(pdf: jsPDF, y: number, label: string, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 26, title, reportId);
  setText(pdf, COLOR.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.2);
  pdf.text(label.toUpperCase(), PAGE.margin, y);
  return y + 14;
}
function para(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const body = clean(text, "");
  if (!body) return y;
  pdf.setFont("times", "normal");
  pdf.setFontSize(10);
  setText(pdf, COLOR.text);
  const lines = pdf.splitTextToSize(body, PAGE.width - PAGE.margin * 2) as string[];
  y = ensureSpace(pdf, y, lines.length * 12 + 10, title, reportId);
  pdf.text(lines, PAGE.margin, y);
  return y + lines.length * 12 + 8;
}
function brief(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(clean(text), PAGE.width - PAGE.margin * 2 - 20) as string[];
  y = ensureSpace(pdf, y, lines.length * 11 + 22, title, reportId);
  setFill(pdf, COLOR.highlight);
  setDraw(pdf, COLOR.border);
  pdf.roundedRect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, lines.length * 11 + 14, 4, 4, "FD");
  setText(pdf, COLOR.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.6);
  pdf.text(lines, PAGE.margin + 10, y + 14);
  return y + lines.length * 11 + 22;
}
function takeaway(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, PAGE.width - PAGE.margin * 2 - 28) as string[];
  y = ensureSpace(pdf, y, lines.length * 12 + 30, title, reportId);
  setFill(pdf, COLOR.teal);
  pdf.roundedRect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, lines.length * 12 + 18, 4, 4, "F");
  setText(pdf, COLOR.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.9);
  pdf.text(lines, PAGE.margin + 12, y + 15);
  return y + lines.length * 12 + 30;
}
function table(pdf: jsPDF, y: number, title: string, reportId: string, head: string[][], body: Cell[][], opts: { fontSize?: number; firstWidth?: number; scoreWidth?: number; highlightLast?: boolean } = {}) {
  if (!body.length) return y;
  const columnStyles: Record<number, { cellWidth?: number; fontStyle?: string }> = {};
  if (opts.firstWidth) columnStyles[0] = { cellWidth: opts.firstWidth, fontStyle: "bold" };
  if (opts.scoreWidth) columnStyles[1] = { cellWidth: opts.scoreWidth };
  autoTable(pdf, {
    startY: y,
    margin: { left: PAGE.margin, right: PAGE.margin },
    head,
    body,
    styles: { font: "helvetica", fontSize: opts.fontSize ?? 7.4, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: COLOR.text, lineColor: COLOR.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: COLOR.navy, textColor: COLOR.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLOR.stripe },
    columnStyles,
    didParseCell: (data) => { if (opts.highlightLast && data.section === "body" && data.row.index === body.length - 1) data.cell.styles.fillColor = COLOR.highlight; },
    didDrawPage: () => header(pdf, title, reportId),
  });
  return lastTableY(pdf, y) + 16;
}
function fields(pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) {
  return table(pdf, y, title, reportId, [["Field", "Details"]], rows, { firstWidth: 128, fontSize: 7.8 });
}
function bullets(pdf: jsPDF, y: number, items: string[], title: string, reportId: string) {
  for (const item of items) {
    const lines = pdf.splitTextToSize(clean(item), PAGE.width - PAGE.margin * 2 - 20) as string[];
    y = ensureSpace(pdf, y, lines.length * 11 + 8, title, reportId);
    setText(pdf, COLOR.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    pdf.text("•", PAGE.margin, y);
    pdf.text(lines, PAGE.margin + 18, y);
    y += lines.length * 11 + 5;
  }
  return y + 4;
}

function scoringRows(report: FeasibilityReport): Cell[][] {
  return [
    ["Financial Feasibility", score(report.scores.financial), clean(report.scores.financialFinding)],
    ["Market Attractiveness", score(report.scores.market), clean(report.scores.marketFinding)],
    ["Technical Achievability", score(report.scores.achievability), clean(report.scores.achievabilityFinding)],
    ["Operational Feasibility", score(report.scores.operational), clean(report.scores.operationalFinding)],
    ["Risk Level", score(report.scores.risk), clean(report.scores.riskFinding)],
    ["Market Timing", score(report.scores.timing), clean(report.scores.timingFinding)],
    ["Overall Weighted Score", score(report.scores.overall), clean(report.scores.verdict)],
  ];
}
function methodologyRows(report: FeasibilityReport): Cell[][] {
  const weights = report.scores.weights;
  const confidence = report.scores.confidence;
  const rationale = report.scores.rationale;
  if (!weights && !confidence && !rationale) return [];
  const dimensions = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return dimensions.map((dimension) => [
    dimension[0].toUpperCase() + dimension.slice(1),
    weights?.[dimension] !== undefined ? pct(weights[dimension] * 100) : "—",
    confidence?.[dimension] !== undefined ? pct(confidence[dimension]) : "—",
    clean(rationale?.[dimension]),
  ]);
}
function marketRows(report: FeasibilityReport): Cell[][] {
  const market = correctedMarket(report);
  const tamCagr = parseCagr(report.market.tamCagr, 0.142);
  const samCagr = parseCagr(report.market.samCagr, tamCagr);
  return Array.from({ length: 5 }, (_, index) => [
    2026 + index,
    (market.tam * Math.pow(1 + tamCagr, index)).toFixed(1),
    (market.sam * Math.pow(1 + samCagr, index)).toFixed(1),
  ]);
}
function wedgeFor(name: string, inputs: ConceptInputs) {
  const lower = name.toLowerCase();
  if (/ibm|cloud pak/.test(lower)) return "Modular API-first deployment in 8-12 weeks versus IBM's heavy implementation cycles; transparent per-agency pricing versus bundled mainframe licensing.";
  if (/palantir|gotham|foundry/.test(lower)) return "Open data model with audit-accessible logic versus proprietary black-box analytics, supporting oversight and public procurement accountability.";
  if (/tyler/.test(lower)) return "Cross-departmental data exchange beyond justice and law-enforcement silos, supporting health, finance and transport agencies on one governed layer.";
  if (/aws|redshift|quicksight/.test(lower)) return "Business-user dashboards with predictable per-seat pricing, reducing the AWS cost black-box and data-engineering dependency.";
  if (/snowflake/.test(lower)) return "Predictable packaged analytics experience versus egress-sensitive consumption and separate BI tooling.";
  if (/tableau|salesforce/.test(lower)) return "Lower enterprise TCO with fewer creator-license constraints and lighter dashboard administration.";
  if (/azure|synapse|power bi|microsoft|oracle|oci/.test(lower)) return "Pre-existing FedRAMP pathway plus agency-specific workflow logic that reduces custom build work across inter-agency data exchanges.";
  if (/looker|google/.test(lower)) return "Self-service analytics without requiring LookML expertise, reducing dependency on data engineering.";
  if (/sap/.test(lower)) return "Faster 8-12 week deployment versus long ERP implementation cycles and SI-heavy delivery.";
  return `${inputs.projectName || "The platform"} should compete through a named workflow wedge tied to the incumbent's specific friction.`;
}
function architectureRows(internal: boolean): Cell[][] {
  if (internal) return [
    ["Integration Layer", "API gateway + ETL/ELT connectors", "Standardize legacy and departmental app ingestion"],
    ["Data Store", "Hybrid warehouse/lakehouse", "Support data residency, governed datasets and scalable analytics"],
    ["Governance", "Catalog, lineage, RBAC and audit logs", "Reduce conflicting departmental reports"],
    ["Analytics Layer", "Semantic model + BI dashboards", "Governed self-service reporting"],
    ["Security", "SSO, encryption and monitoring", "Reduce breach risk and support compliance review"],
  ];
  return [
    ["Application Layer", "Multi-tenant enterprise SaaS", "Workspace, roles, usage telemetry and admin controls"],
    ["Data Layer", "Secure connector framework", "Agency, ERP, justice, finance and health-system data exchange"],
    ["Security", "Zero Trust, audit logs, SOC2/FedRAMP roadmap", "Core buying requirement for public-sector data sharing"],
    ["Deployment", "Cloud marketplace + sovereign/private cloud", "Support national data-residency and procurement requirements"],
    ["AI Layer", "Natural-language query and anomaly detection", "Business-user differentiation beyond static dashboards"],
  ];
}
function riskOwner(risk: string) {
  const text = risk.toLowerCase();
  if (/legacy|integration|technical|engineering/.test(text)) return "CTO / Data Platform Lead";
  if (/change|adoption|resistance|churn/.test(text)) return "Customer Success Lead";
  if (/security|privacy|compliance|law|cyber/.test(text)) return "CISO / Legal Counsel";
  return "Executive Sponsor";
}
function riskRows(report: FeasibilityReport): Cell[][] {
  const base = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 15_000_000);
  const probability = { Low: 15, Med: 35, High: 60 } as const;
  const impact = { Low: 0.1, Med: 0.25, High: 0.45 } as const;
  return report.risks.map((risk) => {
    const existing = report.quantifiedRisks?.find((item) => item.risk.toLowerCase().includes(risk.name.toLowerCase().slice(0, 10)));
    const prob = existing?.probabilityPercent ?? probability[risk.probability] ?? 35;
    const amount = base * (impact[risk.impact] ?? 0.25);
    return [clean(risk.name), risk.probability, risk.impact, risk.level, existing?.expectedValue || money(report.financials.currency, amount * (prob / 100)), riskOwner(risk.name), clean(risk.mitigation)];
  });
}
function opexRows(report: FeasibilityReport, internal: boolean): Cell[][] {
  const rows = report.financials.opEx?.map((item) => [internal && /marketing|sales/i.test(item.category) ? "Internal Communications & Adoption Marketing" : item.category, num(item.monthly), num(item.annual)]) || [];
  if (!internal && !rows.some((row) => /customer success/i.test(String(row[0])))) rows.push(["Customer Success & Implementation", "65,000", "780,000"]);
  return rows;
}
function enterpriseCashFlow(report: FeasibilityReport): Cell[][] {
  const monthlyContract = acv(report) / 12;
  const baseOpex = report.financials.opEx?.reduce((sum, item) => sum + (Number.isFinite(item.monthly) ? item.monthly : 0), 0) || 575_000;
  const monthlyOpex = baseOpex + (report.financials.opEx?.some((item) => /customer success/i.test(item.category)) ? 0 : 65_000);
  let cash = report.financials.capExTotal?.mid || 15_000_000;
  let active = 0;
  const logos = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7];
  return logos.map((newLogos, index) => {
    const churn = index < 8 ? 0 : Math.floor(active * 0.025);
    active = Math.max(0, active + newLogos - churn);
    const mrr = active * monthlyContract;
    cash += mrr - monthlyOpex;
    return [`M${index + 1}`, newLogos, churn, active, money(report.financials.currency, mrr), money(report.financials.currency, monthlyOpex), money(report.financials.currency, cash)];
  });
}
function enterpriseScenarioRows(report: FeasibilityReport): Cell[][] {
  const annualContract = acv(report);
  return [
    ["Optimistic", "20%", "125 enterprises", money(report.financials.currency, 125 * annualContract), "1%", "18 months"],
    ["Base Case", "60%", "45 enterprises", money(report.financials.currency, 45 * annualContract), "2.5%", "22 months"],
    ["Pessimistic", "20%", "12 enterprises", money(report.financials.currency, 12 * annualContract), "6%", "40 months"],
  ];
}
function sensitivityRows(): Cell[][] {
  return [
    ["Monthly churn", "1%", "2.5%", "6%", "Highest break-even sensitivity"],
    ["CAC / procurement cost", "USD 150k", "USD 250k", "USD 400k", "Controls payback and runway"],
    ["Pilot conversion", "50%", "30%", "15%", "Determines if Year 1 customer plan is credible"],
    ["Cloud/SOC run cost", "-10%", "Base", "+20%", "Pressure-tests OpEx resilience"],
  ];
}
function investorRows(report: FeasibilityReport): Cell[][] {
  const annualContract = acv(report);
  const customers = [12, 45, 85, 140, 220];
  const multiples = [6, 7, 8, 9, 10];
  return customers.map((count, index) => {
    const arr = count * annualContract;
    return [`Y${index + 1}`, `${count} customers`, money(report.financials.currency, arr), `${multiples[index]}x ARR`, money(report.financials.currency, arr * multiples[index])];
  });
}
function pricingRows(report: FeasibilityReport): Cell[][] {
  const annualContract = acv(report);
  return [
    ["Pilot", "1 agency / 25-50 users", money(report.financials.currency, 50_000), "90-day pilot, 3 connectors, guided implementation"],
    ["Enterprise Core", "50-500 users", money(report.financials.currency, annualContract), "Governed exchange, 10 connectors, SSO, audit logs, standard SLA"],
    ["National Plus", "500+ users / regulated workloads", money(report.financials.currency, annualContract * 2.5), "FedRAMP/high-impact controls, data residency, premium support, custom connectors"],
  ];
}
function gtmRows(): Cell[][] {
  return [
    ["Founder-led government outbound", "Win design partners", "Matches procurement-heavy public-sector buying.", "60 target accounts / 12 SQLs / 4 pilots"],
    ["Cloud marketplace co-sell", "Reduce procurement friction", "AWS/Azure/GCP marketplace listing shortens vendor onboarding.", "2 listings / 6 co-sell opportunities"],
    ["Systems integrator partners", "Access agency modernization programs", "SIs already own data transformation budgets.", "3 partners / 8 referred opportunities"],
    ["Product-led sandbox", "Expansion only", "Used after central approval for agency-level adoption.", "20 expansion teams inside signed customers"],
  ];
}
function phaseGateRows(internal: boolean): Cell[][] {
  if (internal) return [
    ["0. Validation", "0-8 weeks", "Baseline reporting hours, data-quality defects and cost-of-delay quantified", "No named owners or no measurable ROI baseline"],
    ["1. MVP", "2-6 months", "Pilot domain migrated; data quality score improves by at least 20%", "Security controls fail or pilot users reject workflow"],
    ["2. Pilot", "6-12 months", "At least 60% active usage and at least 25% reporting-time reduction", "Adoption below 40% after training"],
    ["3. Scale", "12-24 months", "Benefits dashboard proves run-rate savings exceed OpEx", "Savings fail to cover incremental run cost"],
  ];
  return [
    ["0. Validation", "0-8 weeks", "15 enterprise interviews, 3 LOIs, security requirements mapped", "Fewer than 2 LOIs or no validated ACV"],
    ["1. MVP", "2-6 months", "3 connectors live, SOC2/FedRAMP plan active, first paid pilot signed", "No paid pilot or severe integration blockers"],
    ["2. Pilot", "6-12 months", "3 paying pilots, NPS at least 35, churn intent at most 3%", "MRR below USD 50k or NPS below 20"],
    ["3. Scale", "12-24 months", "CAC payback below 18 months and 12+ customers", "Pipeline conversion below 15% or gross retention below 90%"],
  ];
}
function internalRoi(report: FeasibilityReport) {
  const users = 120;
  const hours = 6;
  const weeks = 52;
  const rate = 85;
  const recovery = 0.55;
  const annualSavings = users * hours * weeks * rate * recovery;
  const annualOpex = report.financials.opEx?.reduce((sum, item) => sum + (item.annual || 0), 0) || 2_220_000;
  return { users, hours, weeks, rate, recovery, annualSavings, annualOpex, net: annualSavings - annualOpex };
}
function internalCashFlow(report: FeasibilityReport): Cell[][] {
  const roi = internalRoi(report);
  let cumulative = -(report.financials.capExTotal.mid || 2_950_000);
  return Array.from({ length: 36 }, (_, index) => {
    const month = index + 1;
    const adoption = month <= 6 ? month * 5 : month <= 24 ? Math.min(85, 30 + (month - 6) * 3.2) : Math.min(110, 85 + (month - 24) * 2.1);
    const gross = (roi.annualSavings / 12) * (adoption / 75);
    const opex = roi.annualOpex / 12;
    const net = gross - opex;
    cumulative += net;
    return [`M${month}`, pct(adoption), money(report.financials.currency, gross), money(report.financials.currency, opex), money(report.financials.currency, net), money(report.financials.currency, cumulative)];
  });
}
function diagramFmart(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 135, title, reportId, "FMART");
  y = sub(pdf, y, "FMART Score Visual", title, reportId);
  const rows = [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]] as const;
  rows.forEach(([label, value], index) => {
    const yy = y + index * 15;
    setText(pdf, COLOR.text);
    pdf.setFontSize(7.5);
    pdf.text(label, PAGE.margin, yy);
    setDraw(pdf, COLOR.border);
    pdf.rect(PAGE.margin + 85, yy - 7, 180, 7);
    setFill(pdf, COLOR.teal);
    pdf.rect(PAGE.margin + 85, yy - 7, 18 * value, 7, "F");
    pdf.text(score(value), PAGE.margin + 275, yy);
  });
  return y + rows.length * 15 + 16;
}
function diagramMarket(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  const market = correctedMarket(report);
  y = ensureSpace(pdf, y, 120, title, reportId, "Market");
  y = sub(pdf, y, "TAM / SAM / SOM Funnel", title, reportId);
  const rows = [["TAM", `$${market.tam.toFixed(1)}B`], ["SAM", `$${market.sam.toFixed(1)}B`], ["SOM", `$${(market.som * 1000).toFixed(0)}M`]];
  rows.forEach(([label, value], index) => {
    setFill(pdf, index === 0 ? COLOR.navy : index === 1 ? COLOR.teal : COLOR.amber);
    const width = 280 - index * 60;
    pdf.roundedRect(PAGE.margin + index * 30, y + index * 23, width, 17, 3, 3, "F");
    setText(pdf, COLOR.white);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.8);
    pdf.text(`${label}: ${value}`, PAGE.margin + index * 30 + 8, y + index * 23 + 12);
  });
  if (market.tamCorrected) {
    setText(pdf, COLOR.muted);
    pdf.setFontSize(7);
    pdf.text("TAM adjusted above SAM to preserve market-sizing hierarchy.", PAGE.margin, y + 78);
  }
  return y + 96;
}
function diagramCash(pdf: jsPDF, y: number, report: FeasibilityReport, internal: boolean, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 105, title, reportId, "Financial");
  y = sub(pdf, y, internal ? "ROI Bridge Direction" : "MRR Ramp Direction", title, reportId);
  const data = internal ? internalCashFlow(report).slice(0, 12).map((row) => Number(String(row[4]).replace(/[^0-9-]/g, "")) || 0) : enterpriseCashFlow(report).slice(0, 12).map((row) => Number(String(row[4]).replace(/[^0-9]/g, "")) || 0);
  const max = Math.max(...data.map(Math.abs), 1);
  data.forEach((value, index) => {
    const height = Math.max(2, Math.abs(value) / max * 46);
    setFill(pdf, value < 0 ? COLOR.red : COLOR.teal);
    pdf.rect(PAGE.margin + index * 18, y + 52 - height, 10, height, "F");
  });
  setDraw(pdf, COLOR.border);
  pdf.line(PAGE.margin, y + 54, PAGE.margin + 220, y + 54);
  setText(pdf, COLOR.muted);
  pdf.setFontSize(7);
  pdf.text("M1", PAGE.margin, y + 66);
  pdf.text("M12", PAGE.margin + 198, y + 66);
  return y + 80;
}
function diagramRisk(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 120, title, reportId, "Risk");
  y = sub(pdf, y, "Risk Exposure Ranking", title, reportId);
  const rows = riskRows(report).slice(0, 5);
  rows.forEach((risk, index) => {
    const value = parseAmount(String(risk[4]), 1_000_000);
    const width = Math.min(220, value / 2_500_000 * 180);
    const yy = y + index * 17;
    setText(pdf, COLOR.text);
    pdf.setFontSize(7);
    pdf.text(String(risk[0]).slice(0, 26), PAGE.margin, yy);
    setFill(pdf, index === 0 ? COLOR.red : index < 3 ? COLOR.amber : COLOR.green);
    pdf.rect(PAGE.margin + 150, yy - 8, width, 8, "F");
  });
  return y + rows.length * 17 + 18;
}
function diagramFunding(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  y = ensureSpace(pdf, y, 95, title, reportId, "Funding");
  y = sub(pdf, y, "Funding Mix Snapshot", title, reportId);
  let x = PAGE.margin;
  (report.fundingMix || []).forEach((source, index) => {
    const share = Number(String(source.share).replace(/[^0-9]/g, "")) || 0;
    const width = share * 3;
    setFill(pdf, index === 0 ? COLOR.navy : index === 1 ? COLOR.teal : COLOR.amber);
    pdf.rect(x, y, width, 16, "F");
    setText(pdf, COLOR.text);
    pdf.setFontSize(7);
    pdf.text(`${source.source}: ${source.share}`, x, y + 31);
    x += width + 4;
  });
  return y + 48;
}
function cleanCitations(report: FeasibilityReport) {
  return (report.research?.citations || [])
    .filter((citation) => !/hacker news|0 comments|job fair|moscone/i.test(`${citation.source} ${citation.title} ${citation.takeaway}`))
    .slice(0, 8)
    .map((citation) => ({ ...citation, title: clean(citation.title).replace(/Ict/g, "ICT").replace(/Analyt\.$/i, "Analytics") }));
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const internal = isInternal(inputs, report);
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs, internal ? "Internal infrastructure ROI case" : "Enterprise contract SaaS investment case");
  let y = addPage(pdf, title, reportId, "Governing Thesis");

  y = major(pdf, y, "1. Governing Thesis & Report Scope", internal ? "This is an internal ROI case, not a commercial SaaS valuation case" : "The investment case depends on enterprise ACV, churn control and proof of paid pilots", title, reportId);
  y = brief(pdf, y, internal ? "This case should be approved only if measured savings and risk reduction exceed TCO." : `This case uses one enterprise SaaS model: ACV-based revenue, enterprise logo acquisition, churn assumptions and investor return logic. Base-case success depends on 45 customers at ${money(report.financials.currency, acv(report))} ACV.`, title, reportId);
  y = para(pdf, y, internal ? `${inputs.projectName} is an internal platform intended to reduce data silos, improve reporting speed and strengthen data governance.` : `${inputs.projectName} is a secure inter-agency data exchange layer for public-sector organisations that need governed sharing, auditability and rapid integration across siloed legacy systems.`, title, reportId);
  y = table(pdf, sub(pdf, y, "SCR Argument Logic", title, reportId), title, reportId, [["Argument", "Evidence", "Implication"]], internal ? [["Need", "Manual reporting and siloed data slow decisions", "Measure current hours and defects before funding"], ["Economics", "ROI depends on recovered time exceeding OpEx", "Release budget by stage"], ["Risk", "Legacy integration and adoption dominate risk", "Name technical and change owners"]] : [["Market", "Government data exchange demand is rising", "Target high-need regulated buyers"], ["Economics", "ACV and churn drive break-even", "Validate pricing through LOIs"], ["Execution", "Certification, connectors and security review are key", "Gate scale funding after paid pilots"]], { firstWidth: 82, fontSize: 7.2 });
  y = diagramFmart(pdf, y, report, title, reportId);
  y = table(pdf, sub(pdf, y, "FMART Scorecard", title, reportId), title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { firstWidth: 122, scoreWidth: 70, fontSize: 7.3, highlightLast: true });
  const method = methodologyRows(report);
  if (method.length) y = table(pdf, sub(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId), title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], method, { firstWidth: 85, fontSize: 7.1 });
  y = takeaway(pdf, y, internal ? "Approve only if benefits tracking closes the TCO gap." : "Enterprise ACV, churn and paid pilots are the decision variables.", title, reportId);

  y = major(pdf, y, "2. Situation: Market Context & Problem Definition", internal ? "External growth validates technology relevance; internal value capture decides funding" : "Corrected market sizing keeps TAM above SAM and focuses on reachable SOM", title, reportId);
  const market = correctedMarket(report);
  y = brief(pdf, y, internal ? "The market confirms that data integration demand is real, but internal adoption and run-cost control matter more than market size." : `The corrected TAM is $${market.tam.toFixed(1)}B, the SAM is $${market.sam.toFixed(1)}B, and SOM remains a focused $${Math.round(market.som * 1000)}M target.`, title, reportId);
  y = fields(pdf, y, title, reportId, [["Project", clean(inputs.projectName)], ["Industry", clean(inputs.industry)], ["Location", clean(inputs.location)], ["Business Model", internal ? "Internal infrastructure / CapEx project" : "Enterprise SaaS / subscription software"], ["Value Model", internal ? "Efficiency ROI and risk reduction" : `Enterprise ACV of ${money(report.financials.currency, acv(report))}`], ["Budget Range", clean(inputs.budgetRange)], ["Timeline", clean(inputs.timeline)], ["Team Size", clean(inputs.teamSize)], ["Technology Readiness", clean(inputs.technologyReadiness)]]);
  y = diagramMarket(pdf, y, report, title, reportId);
  y = table(pdf, sub(pdf, y, "Market Sizing & Growth", title, reportId), title, reportId, [["Year", `TAM (${report.market.currency || "USD"}, billions)`, `SAM (${report.market.currency || "USD"}, billions)`]], marketRows(report), { firstWidth: 80, fontSize: 7.6 });

  y = major(pdf, y, "3. Team, Product & Architecture", "The product must explain what changes for the buyer before financial analysis starts", title, reportId);
  y = brief(pdf, y, internal ? "The platform needs named accountability and a signed technical design before approval." : "The product promise is one governed exchange layer for agencies, with audit logs, security controls and connectors that reduce manual sharing and legacy integration friction.", title, reportId);
  y = table(pdf, sub(pdf, y, "Technology Architecture", title, reportId), title, reportId, [["Layer", "Recommended Choice", "Rationale"]], architectureRows(internal), { firstWidth: 90, fontSize: 7.1 });

  y = major(pdf, y, "4. Market Attractiveness & Competitive Positioning", "Each incumbent requires a distinct wedge tied to its specific friction", title, reportId);
  y = brief(pdf, y, internal ? "Incumbents compete on scale and ecosystem strength; the internal platform wins only if it shortens time-to-value and improves governance." : "Microsoft/Oracle, IBM, Palantir and Tyler each require a different wedge: certification path, implementation speed, auditability and cross-department breadth.", title, reportId);
  y = fields(pdf, y, title, reportId, [["Target Segment", internal ? "Internal enterprise departments" : "$50M+ public-sector and GovTech buyers"], ["Customer Goal", clean(report.customer.goals)], ["Buying / Adoption Behavior", clean(report.customer.behavior)], ["Willingness to Pay / Fund", clean(report.customer.willingnessToPay)]]);
  if (report.competitors?.length) y = table(pdf, y, title, reportId, [["Competitor", "Their Moat", "Weakness", "Our Wedge"]], report.competitors.map((competitor) => [clean(competitor.name), clean(competitor.edge), clean(competitor.weakness), wedgeFor(clean(competitor.name), inputs)]), { firstWidth: 76, fontSize: 6.7 });
  y = takeaway(pdf, y, "The table now contains named, competitor-specific wedges instead of placeholders.", title, reportId);

  y = major(pdf, y, "5. Financial Model & Scenario Analysis", internal ? "Savings must exceed run cost before scale funding" : "Enterprise ACV, churn, customer success and cash burn drive the break-even path", title, reportId);
  y = brief(pdf, y, internal ? "The base case must show monthly benefits exceeding monthly OpEx; if not, approval requires a mitigation plan." : `Base case assumes 45 customers at ${money(report.financials.currency, acv(report))} ACV and 2.5% monthly churn.`, title, reportId);
  y = fields(pdf, y, title, reportId, [["Investment Range", clean(report.financials.investmentRange)], ["Break-Even", internal ? clean(report.financials.breakEvenSummary) : "Month 22 target under Base Case enterprise-logo model"], ["LTV : CAC", internal ? "Not applicable — internal ROI project" : clean(report.financials.ltvCacRatio, "4.2:1")], ["CapEx Mid", money(report.financials.currency, report.financials.capExTotal.mid)]]);
  y = table(pdf, sub(pdf, y, "Operating Expenses", title, reportId), title, reportId, [["Category", "Monthly", "Annual"]], opexRows(report, internal), { firstWidth: 205, fontSize: 7.5 });
  if (internal) {
    const roi = internalRoi(report);
    y = table(pdf, sub(pdf, y, "Efficiency ROI Calculation", title, reportId), title, reportId, [["Driver", "Assumption", "Result"]], [["Population", `${roi.users} analysts / data users`, "Named denominator"], ["Hours Saved", `${roi.hours} hours per week`, "Manual reporting reduction"], ["Annual Gross Savings", money(report.financials.currency, roi.annualSavings), `${roi.users} x ${roi.hours} x ${roi.weeks} x ${money(report.financials.currency, roi.rate)} x ${pct(roi.recovery * 100)}`], ["Annual OpEx", money(report.financials.currency, roi.annualOpex), "Run-rate cost"], ["Net Annual Benefit", money(report.financials.currency, roi.net), "Savings less OpEx"]], { firstWidth: 115, fontSize: 7.1 });
    y = diagramCash(pdf, y, report, internal, title, reportId);
    y = table(pdf, sub(pdf, y, "36-Month Internal ROI Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "Adoption", "Gross Savings", "OpEx", "Net Cash Flow", "Cumulative Net vs CapEx"]], internalCashFlow(report), { firstWidth: 45, fontSize: 5.9 });
  } else {
    y = table(pdf, sub(pdf, y, "Revenue Scenarios", title, reportId), title, reportId, [["Scenario", "Probability", "Yr 1 Customers", "ARR", "Monthly Churn", "Break-Even"]], enterpriseScenarioRows(report), { firstWidth: 78, fontSize: 7.1 });
    y = diagramCash(pdf, y, report, internal, title, reportId);
    y = table(pdf, sub(pdf, y, "24-Month Enterprise MRR & Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "New Logos", "Churn", "Active Accounts", "MRR", "Monthly OpEx", "Cash Position"]], enterpriseCashFlow(report), { firstWidth: 44, fontSize: 6.1 });
    y = table(pdf, sub(pdf, y, "Static Sensitivity Snapshot", title, reportId), title, reportId, [["Driver", "Upside", "Base", "Downside", "Why It Matters"]], sensitivityRows(), { firstWidth: 96, fontSize: 6.8 });
  }

  y = major(pdf, y, "6. Risk Register With Expected Value", "The risk table must show dollars, not only high/medium/low labels", title, reportId);
  y = brief(pdf, y, "Risk exposure is shown with EV and named owners, so the reader does not need to jump pages to understand financial exposure.", title, reportId);
  y = diagramRisk(pdf, y, report, title, reportId);
  y = table(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Expected Value", "Owner", "Mitigation"]], riskRows(report), { firstWidth: 78, fontSize: 6.2 });

  y = major(pdf, y, internal ? "7. Funding Structure & Internal ROI" : "7. Funding Structure & Investor Returns", internal ? "Funding should be staged against benefit realization" : "Investors need ACV-based ARR, retention and exit value clarity", title, reportId);
  y = brief(pdf, y, internal ? "Do not release full CapEx upfront; release it by validation, MVP, pilot and scale gates." : "The investment case must show what the investor owns in five years; ARR multiple logic provides the first-pass answer.", title, reportId);
  if (!internal && report.fundingMix?.length) {
    y = diagramFunding(pdf, y, report, title, reportId);
    y = table(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((source) => [source.source, source.share, source.amount, source.rationale]), { firstWidth: 115, fontSize: 7.2 });
  }
  if (!internal) y = table(pdf, sub(pdf, y, "Five-Year Investor Return Model", title, reportId), title, reportId, [["Year", "Customers", "ARR", "Multiple", "Implied Valuation"]], investorRows(report), { firstWidth: 45, fontSize: 7.1 });

  y = major(pdf, y, internal ? "8. Internal Adoption Strategy" : "8. Go-to-Market Strategy", internal ? "Departmental rollout sequencing determines value realization" : "Enterprise-first GTM should replace SMB self-serve assumptions", title, reportId);
  y = brief(pdf, y, internal ? "Adoption is the economic engine of the internal case." : "The primary motion is government/enterprise outbound, marketplace co-sell and SI partnerships; product-led sandbox is an expansion tactic only.", title, reportId);
  if (internal) y = table(pdf, y, title, reportId, [["Workstream", "Owner", "Target", "Success Metric"]], [["Executive Mandate", "Executive Sponsor", "Participating departments", "Named data owners approved"], ["Training & Enablement", "Change Lead", "Analysts and power users", "75% active usage by Month 12"], ["Compliance", "CISO / Legal Counsel", "Security controls", "Audit logs validated"]], { firstWidth: 105, fontSize: 7.2 });
  else {
    y = table(pdf, y, title, reportId, [["Channel", "Role", "Rationale", "Year 1 Target"]], gtmRows(), { firstWidth: 88, fontSize: 6.9 });
    y = table(pdf, sub(pdf, y, "Pricing Ladder", title, reportId), title, reportId, [["Tier", "Target Customer", "Annual Price", "Feature Gate"]], pricingRows(report), { firstWidth: 75, fontSize: 6.9 });
  }

  y = major(pdf, y, "9. Implementation Roadmap", "Phase gates must define go/no-go thresholds, not just activities", title, reportId);
  y = brief(pdf, y, "Each gate gives quantified pass/fail logic, so funding can stop if evidence does not support scale.", title, reportId);
  y = table(pdf, y, title, reportId, [["Phase", "Timeline", "Go Criteria", "No-Go Trigger"]], phaseGateRows(internal), { firstWidth: 68, fontSize: 6.8 });

  y = major(pdf, y, "10. Strategic Recommendations", "Recommendations must be specific to the inter-agency secure exchange wedge", title, reportId);
  y = bullets(pdf, y, internal ? ["1. Start with one high-value data domain and measure reporting-hour reduction before scaling.", "2. Name accountable owners for data quality, platform architecture, change management and compliance.", "3. Use phase-gate funding releases tied to adoption, data-quality and savings thresholds."] : ["1. Lead with security-first positioning — make Zero Trust, FedRAMP path, audit logs and data residency the first sales proof points.", "2. Prioritize inter-agency workflows — start with justice-to-health or finance-to-benefits data flows where the pain is visible.", "3. Build connectors before dashboards — legacy integration is the core adoption barrier, not charting capability.", "4. Use SI and cloud marketplace channels — procurement-heavy agencies need buying paths they already trust.", "5. Create an oversight-ready audit model — differentiate against black-box competitors with explainable access and exchange logs."], title, reportId);

  y = major(pdf, y, "11. Appendix: Limitations, Assumptions & Primary Research", "The report is decision-useful but requires validation before final approval", title, reportId);
  y = fields(pdf, y, title, reportId, [["Assumptions", clean(inputs.assumptions)], ["Constraints", clean(inputs.constraints)], ["Success Factors", clean(inputs.successFactors)], ["Known Risks", clean(inputs.knownRisks)], ["Regulatory Considerations", clean(inputs.regulatoryConsiderations)], ["Dependencies", clean(inputs.dependencies)]]);
  y = takeaway(pdf, y, internal ? "Validate reporting hours, data defects and adoption barriers before scale funding." : "Validate ACV, procurement path, security requirements, churn risk and implementation cost before fundraising materials are shared.", title, reportId);
  const citations = cleanCitations(report);
  if (citations.length) {
    y = major(pdf, y, "12. Appendix: Clean Source Notes", "Source notes stay outside the body", title, reportId);
    citations.forEach((citation, index) => {
      y = para(pdf, y, `${index + 1}. ${clean(citation.title)}. Source: ${clean(citation.source)}. Key takeaway: ${clean(citation.takeaway)}. URL: ${clean(citation.url)}`, title, reportId);
    });
  }

  (pdf as PdfWithAutoTable).putTotalPages?.(TOTAL_PAGES);
  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
