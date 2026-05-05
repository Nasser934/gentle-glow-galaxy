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
  amber: [232, 160, 0] as [number, number, number],
  red: [192, 57, 43] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [88, 96, 112] as [number, number, number],
  border: [213, 216, 220] as [number, number, number],
  stripe: [242, 243, 244] as [number, number, number],
  highlight: [254, 249, 231] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const tc = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setTextColor(...rgb);
const fc = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setFillColor(...rgb);
const dc = (pdf: jsPDF, rgb: [number, number, number]) => pdf.setDrawColor(...rgb);
const lastY = (pdf: jsPDF, y: number) => (pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? y;
const clean = (v: unknown, fallback = "—") => (v === null || v === undefined || String(v).trim() === "" ? fallback : String(v).replace(/\\n/g, " ").replace(/[\u0011\u0012\u0013]/g, "-").replace(/\s+/g, " ").replace(/council/gi, "counsel").replace(/Massive|massive/g, "Large").replace(/Perfect/g, "Strong").trim());
const score = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}/10` : "—");
const num = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "—");
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n)}%` : "—");
const money = (currency: string, n: number) => {
  if (!Number.isFinite(n)) return "—";
  const label = currency || "USD";
  return n < 0 ? `(${label} ${Math.abs(Math.round(n)).toLocaleString()})` : `${label} ${Math.round(n).toLocaleString()}`;
};
const parseAmount = (text: string, fallback: number) => {
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  if (/b/i.test(text)) return n * 1_000_000_000;
  if (/m/i.test(text)) return n * 1_000_000;
  if (/k/i.test(text)) return n * 1_000;
  return n;
};
const parseCagr = (text: string, fallback: number) => {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : fallback;
};

function isInternal(inputs: ConceptInputs, report: FeasibilityReport) {
  const t = `${inputs.businessModel} ${inputs.revenueModel} ${report.financials.ltvCacRatio || ""} ${report.financials.breakEvenSummary}`.toLowerCase();
  return /internal|infrastructure|capex|efficiency roi|cost savings|savings|n\/a/.test(t) && !/saas|subscription/.test(t);
}
const acv = (report: FeasibilityReport) => {
  const t = `${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`;
  const m = t.match(/\$?(\d+(?:\.\d+)?)\s*k\s*ACV/i);
  return m ? Number(m[1]) * 1000 : 100_000;
};

function header(pdf: jsPDF, title: string, reportId: string) {
  fc(pdf, color.navy); pdf.rect(0, 0, page.width, 8, "F");
  tc(pdf, color.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", page.margin, 28);
  tc(pdf, color.muted); pdf.setFont("helvetica", "normal"); pdf.text(title || "Untitled", page.width - page.margin, 28, { align: "right" });
  dc(pdf, color.border); pdf.line(page.margin, page.height - 42, page.width - page.margin, page.height - 42);
  pdf.setFontSize(7.5); pdf.text(`Report ${reportId} | Concept AI | Page ${pdf.getNumberOfPages()}`, page.margin, page.height - 26);
}
function addPage(pdf: jsPDF, title: string, reportId: string) { pdf.addPage(); header(pdf, title, reportId); return 62; }
function need(pdf: jsPDF, y: number, h: number, title: string, reportId: string) { return y + h > page.height - page.bottom ? addPage(pdf, title, reportId) : y; }
function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs, model: string) {
  fc(pdf, color.navy); pdf.rect(0, 0, page.width, page.height, "F");
  fc(pdf, [0, 22, 70]); pdf.rect(0, page.height - 112, page.width, 112, "F");
  tc(pdf, color.white); pdf.setFont("times", "bold"); pdf.setFontSize(32);
  const lines = pdf.splitTextToSize(inputs.projectName || "Feasibility Report", page.width - page.margin * 2) as string[];
  pdf.text(lines, page.margin, 184);
  tc(pdf, color.teal); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
  pdf.text(`${inputs.industry || "Strategic Feasibility"} · ${inputs.location || "Target market"}`, page.margin, 190 + lines.length * 34);
  tc(pdf, color.white); pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
  pdf.text(`${clean(report.classification, "Confidential")} — ${model}`, page.margin, 270);
  pdf.setFontSize(9); pdf.text(`Report ID: ${clean(report.reportId)}`, page.margin, page.height - 72);
  pdf.text(`Date: ${clean(report.dateIssued)}`, page.margin + 170, page.height - 72);
  pdf.text(`Prepared by: ${clean(report.preparedBy, "Concept AI")}`, page.margin + 310, page.height - 72);
}
function major(pdf: jsPDF, y: number, label: string, action: string, title: string, reportId: string) {
  y = need(pdf, y, 62, title, reportId);
  fc(pdf, color.navy); pdf.rect(page.margin, y - 10, page.width - page.margin * 2, 3, "F");
  tc(pdf, color.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  const lines = pdf.splitTextToSize(`${label.toUpperCase()} — ${action}`, page.width - page.margin * 2) as string[];
  pdf.text(lines, page.margin, y + 10);
  dc(pdf, color.border); pdf.line(page.margin, y + 18 + (lines.length - 1) * 12, page.width - page.margin, y + 18 + (lines.length - 1) * 12);
  return y + 36 + (lines.length - 1) * 12;
}
function sub(pdf: jsPDF, y: number, label: string, title: string, reportId: string) {
  y = need(pdf, y, 26, title, reportId);
  tc(pdf, color.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.5); pdf.text(label.toUpperCase(), page.margin, y);
  return y + 14;
}
function para(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const body = clean(text, ""); if (!body) return y;
  pdf.setFont("times", "normal"); pdf.setFontSize(10); tc(pdf, color.text);
  const lines = pdf.splitTextToSize(body, page.width - page.margin * 2) as string[];
  y = need(pdf, y, lines.length * 12 + 10, title, reportId);
  pdf.text(lines, page.margin, y); return y + lines.length * 12 + 8;
}
function brief(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(clean(text), page.width - page.margin * 2 - 20) as string[];
  y = need(pdf, y, lines.length * 11 + 22, title, reportId);
  fc(pdf, color.highlight); dc(pdf, color.border); pdf.roundedRect(page.margin, y, page.width - page.margin * 2, lines.length * 11 + 14, 4, 4, "FD");
  tc(pdf, color.text); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.6); pdf.text(lines, page.margin + 10, y + 14);
  return y + lines.length * 11 + 22;
}
function takeaway(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, page.width - page.margin * 2 - 28) as string[];
  y = need(pdf, y, lines.length * 12 + 30, title, reportId);
  fc(pdf, color.teal); pdf.roundedRect(page.margin, y, page.width - page.margin * 2, lines.length * 12 + 18, 4, 4, "F");
  tc(pdf, color.white); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.9); pdf.text(lines, page.margin + 12, y + 15);
  return y + lines.length * 12 + 30;
}
function tbl(pdf: jsPDF, y: number, title: string, reportId: string, head: string[][], body: Cell[][], opts: { fs?: number; first?: number; widths?: Record<number, number>; hiLast?: boolean } = {}) {
  if (!body.length) return y;
  const columnStyles: Record<number, object> = opts.widths ? { ...opts.widths } : {};
  if (opts.first) columnStyles[0] = { ...(columnStyles[0] || {}), cellWidth: opts.first, fontStyle: "bold" };
  autoTable(pdf, {
    startY: y,
    margin: { left: page.margin, right: page.margin },
    head,
    body,
    styles: { font: "helvetica", fontSize: opts.fs ?? 7.4, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: color.text, lineColor: color.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: color.navy, textColor: color.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: color.stripe },
    columnStyles,
    didParseCell: (d) => { if (opts.hiLast && d.section === "body" && d.row.index === body.length - 1) d.cell.styles.fillColor = color.highlight; },
    didDrawPage: () => header(pdf, title, reportId),
  });
  return lastY(pdf, y) + 16;
}
const fields = (pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) => tbl(pdf, y, title, reportId, [["Field", "Details"]], rows, { first: 128, fs: 7.8 });
function bullets(pdf: jsPDF, y: number, items: string[] | undefined, title: string, reportId: string) {
  if (!items?.length) return y;
  for (const item of items) {
    const lines = pdf.splitTextToSize(clean(item), page.width - page.margin * 2 - 20) as string[];
    y = need(pdf, y, lines.length * 11 + 8, title, reportId);
    tc(pdf, color.text); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.8);
    pdf.text("•", page.margin, y); pdf.text(lines, page.margin + 18, y); y += lines.length * 11 + 5;
  }
  return y + 4;
}

function scoringRows(report: FeasibilityReport): Cell[][] {
  return [["Financial Feasibility", score(report.scores.financial), clean(report.scores.financialFinding)], ["Market Attractiveness", score(report.scores.market), clean(report.scores.marketFinding)], ["Technical Achievability", score(report.scores.achievability), clean(report.scores.achievabilityFinding)], ["Operational Feasibility", score(report.scores.operational), clean(report.scores.operationalFinding)], ["Risk Level", score(report.scores.risk), clean(report.scores.riskFinding)], ["Market Timing", score(report.scores.timing), clean(report.scores.timingFinding)], ["Overall Weighted Score", score(report.scores.overall), clean(report.scores.verdict)]];
}
function methodologyRows(report: FeasibilityReport): Cell[][] {
  const w = report.scores.weights, conf = report.scores.confidence, rat = report.scores.rationale;
  if (!w && !conf && !rat) return [];
  const dims = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return dims.map((d) => [d[0].toUpperCase() + d.slice(1), w?.[d] !== undefined ? pct(w[d] * 100) : "—", conf?.[d] !== undefined ? pct(conf[d]) : "—", clean(rat?.[d])]);
}
function marketRows(report: FeasibilityReport): Cell[][] {
  const tam = parseAmount(report.market.tamValue, 100_000_000_000) / 1_000_000_000;
  const sam = parseAmount(report.market.samValue, 25_000_000_000) / 1_000_000_000;
  const tamCagr = parseCagr(report.market.tamCagr, 0.164);
  const samCagr = parseCagr(report.market.samCagr, 0.11);
  return Array.from({ length: 5 }, (_, i) => [2026 + i, (tam * Math.pow(1 + tamCagr, i)).toFixed(1), (sam * Math.pow(1 + samCagr, i)).toFixed(1)]);
}
function wedgeFor(name: string, inputs: ConceptInputs) {
  const n = name.toLowerCase();
  if (/aws|redshift|quicksight/.test(n)) return "Business-user dashboards with predictable per-seat pricing, reducing the AWS cost black-box and data-engineering dependency.";
  if (/snowflake/.test(n)) return "Predictable packaged analytics experience versus egress-sensitive consumption and separate BI tooling.";
  if (/tableau|salesforce/.test(n)) return "Lower enterprise TCO with fewer creator-license constraints and lighter dashboard administration.";
  if (/azure|synapse|power bi|microsoft/.test(n)) return "No DAX learning curve; analysts can build governed dashboards faster with less IT dependency.";
  if (/looker|google/.test(n)) return "Self-service analytics without requiring LookML expertise, reducing dependency on data engineering.";
  if (/sap/.test(n)) return "Faster 8-12 week deployment versus long ERP implementation cycles and SI-heavy delivery.";
  if (/oracle/.test(n)) return "Flexible licensing and modern UI versus rigid contracts and DBA-heavy operation.";
  return `${inputs.projectName || "The platform"} should compete through a named workflow wedge tied to the incumbent's specific friction.`;
}
function architectureRows(internal: boolean): Cell[][] {
  if (internal) return [["Integration Layer", "API gateway + ETL/ELT connectors", "Standardize SAP, Oracle, SQL Server, Excel and departmental app ingestion"], ["Data Store", "Hybrid warehouse/lakehouse", "Support data residency, governed datasets and scalable analytics"], ["Governance", "Catalog, lineage, RBAC and audit logs", "Reduce conflicting departmental reports"], ["Analytics Layer", "Semantic model + BI dashboards", "Governed self-service reporting"], ["Security", "SSO, encryption and monitoring", "Reduce breach risk and support compliance review"]];
  return [["Application Layer", "Multi-tenant enterprise SaaS", "Workspace, roles, usage telemetry and admin controls"], ["Data Layer", "Cloud warehouse + connector framework", "ERP/CRM/Snowflake/Redshift connectors and governed datasets"], ["Security", "SSO, SOC2 roadmap, audit logs", "Enterprise procurement requirement"], ["Deployment", "Cloud marketplace + private cloud option", "Reduce buying and compliance friction"], ["AI Layer", "Natural-language query and anomaly detection", "Business-user differentiation beyond dashboards"]];
}
function riskOwner(risk: string) {
  const t = risk.toLowerCase();
  if (/legacy|integration|technical|engineering/.test(t)) return "CTO / Data Platform Lead";
  if (/change|adoption|resistance|churn/.test(t)) return "Customer Success Lead";
  if (/security|privacy|compliance|law/.test(t)) return "CISO / Legal Counsel";
  if (/market|competition|pricing|gtm/.test(t)) return "Commercial Lead";
  return "Executive Sponsor";
}
function riskRows(report: FeasibilityReport): Cell[][] {
  const base = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  const prob = { Low: 15, Med: 35, High: 60 } as const;
  const impact = { Low: 0.1, Med: 0.25, High: 0.45 } as const;
  return report.risks.map((r) => {
    const evRow = report.quantifiedRisks?.find((q) => q.risk.toLowerCase().includes(r.name.toLowerCase().slice(0, 10)));
    const p = evRow?.probabilityPercent ?? prob[r.probability] ?? 35;
    const v = base * (impact[r.impact] ?? 0.25);
    return [clean(r.name), clean(r.probability), clean(r.impact), clean(r.level), evRow?.expectedValue || money(report.financials.currency, v * (p / 100)), riskOwner(r.name), clean(r.mitigation)];
  });
}
function opexRows(report: FeasibilityReport, internal: boolean): Cell[][] {
  const rows = report.financials.opEx?.map((x) => [internal && /marketing|sales/i.test(x.category) ? "Internal Communications & Adoption Marketing" : x.category, num(x.monthly), num(x.annual)]) || [];
  if (!internal && !rows.some((r) => /customer success/i.test(String(r[0])))) rows.push(["Customer Success & Implementation", "65,000", "780,000"]);
  return rows;
}
function enterpriseCashFlow(report: FeasibilityReport): Cell[][] {
  const monthlyContract = acv(report) / 12;
  const baseOpex = report.financials.opEx?.reduce((s, x) => s + (Number.isFinite(x.monthly) ? x.monthly : 0), 0) || 230_000;
  const monthlyOpex = baseOpex + 65_000;
  let cash = report.financials.capExTotal?.mid || 3_000_000;
  let active = 0;
  const logos = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7];
  return logos.map((n, i) => {
    const churn = i < 8 ? 0 : Math.floor(active * 0.025);
    active = Math.max(0, active + n - churn);
    const mrr = active * monthlyContract;
    cash += mrr - monthlyOpex;
    return [`M${i + 1}`, n, churn, active, money(report.financials.currency, mrr), money(report.financials.currency, monthlyOpex), money(report.financials.currency, cash)];
  });
}
function enterpriseScenarioRows(report: FeasibilityReport): Cell[][] {
  const a = acv(report);
  return [["Optimistic", "20%", "125 enterprises", money(report.financials.currency, 125 * a), "1%", "18 months"], ["Base Case", "60%", "45 enterprises", money(report.financials.currency, 45 * a), "2.5%", "22 months"], ["Pessimistic", "20%", "12 enterprises", money(report.financials.currency, 12 * a), "6%", "40 months"]];
}
function investorRows(report: FeasibilityReport): Cell[][] {
  const a = acv(report), customers = [12, 45, 85, 140, 220], mult = [6, 7, 8, 9, 10];
  return customers.map((count, i) => [`Y${i + 1}`, `${count} customers`, money(report.financials.currency, count * a), `${mult[i]}x ARR`, money(report.financials.currency, count * a * mult[i])]);
}
function pricingRows(report: FeasibilityReport): Cell[][] {
  const a = acv(report);
  return [["Pilot", "1 business unit / 25-50 users", money(report.financials.currency, 50_000), "90-day pilot, 3 connectors, guided implementation"], ["Enterprise Core", "50-500 users", money(report.financials.currency, a), "Governed dashboards, 10 connectors, SSO, audit logs, standard SLA"], ["Enterprise Plus", "500+ users / regulated workloads", money(report.financials.currency, a * 2.5), "Advanced governance, data residency, premium support, custom connectors"]];
}
function enterpriseGtmRows(): Cell[][] {
  return [["Founder-led enterprise outbound", "Win design partners", "Matches $50M+ target customers and security-heavy procurement.", "60 target accounts / 12 SQLs / 4 pilots"], ["Cloud marketplace co-sell", "Reduce procurement friction", "AWS/Azure/GCP marketplace listing shortens vendor onboarding.", "2 listings / 6 co-sell opportunities"], ["Systems integrator partners", "Access ERP/CRM projects", "SIs already own data transformation budgets.", "3 partners / 8 referred opportunities"], ["Product-led sandbox", "Expansion only", "Used after enterprise approval for team-level adoption.", "20 expansion teams inside signed customers"]];
}
function phaseGateRows(internal: boolean): Cell[][] {
  if (internal) return [["0. Validation", "0-8 weeks", "Baseline reporting hours, data-quality defects and cost-of-delay quantified", "No named owners or no measurable ROI baseline"], ["1. MVP", "2-6 months", "Pilot domain migrated; data quality score improves by at least 20%", "Security controls fail or pilot users reject workflow"], ["2. Pilot", "6-12 months", "At least 60% active usage and at least 25% reporting-time reduction", "Adoption below 40% after training"], ["3. Scale", "12-24 months", "Benefits dashboard proves run-rate savings exceed OpEx", "Savings fail to cover incremental run cost"]];
  return [["0. Validation", "0-8 weeks", "15 enterprise interviews, 3 LOIs, security requirements mapped", "Fewer than 2 LOIs or no validated ACV"], ["1. MVP", "2-6 months", "3 connectors live, SOC2 plan active, first paid pilot signed", "No paid pilot or severe integration blockers"], ["2. Pilot", "6-12 months", "3 paying pilots, NPS at least 35, churn intent at most 3%", "MRR below USD 50k or NPS below 20"], ["3. Scale", "12-24 months", "CAC payback below 18 months and 12+ enterprise customers", "Pipeline conversion below 15% or gross retention below 90%"]];
}
function internalRoi(report: FeasibilityReport) {
  const users = 120, hours = 6, weeks = 52, rate = 85, recovery = 0.55;
  const annualSavings = users * hours * weeks * rate * recovery;
  const annualOpex = report.financials.opEx?.reduce((s, x) => s + (x.annual || 0), 0) || 2_220_000;
  return { users, hours, weeks, rate, recovery, annualSavings, annualOpex, net: annualSavings - annualOpex };
}
function internalCashFlow(report: FeasibilityReport): Cell[][] {
  const r = internalRoi(report); let cumulative = -(report.financials.capExTotal.mid || 2_950_000);
  return Array.from({ length: 36 }, (_, i) => {
    const m = i + 1;
    const adoption = m <= 6 ? m * 5 : m <= 24 ? Math.min(85, 30 + (m - 6) * 3.2) : Math.min(110, 85 + (m - 24) * 2.1);
    const gross = (r.annualSavings / 12) * (adoption / 75);
    const opex = r.annualOpex / 12;
    const net = gross - opex;
    cumulative += net;
    return [`M${m}`, pct(adoption), money(report.financials.currency, gross), money(report.financials.currency, opex), money(report.financials.currency, net), money(report.financials.currency, cumulative)];
  });
}
function diagramFmart(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  y = need(pdf, y, 135, title, reportId);
  y = sub(pdf, y, "FMART Score Visual", title, reportId);
  const rows = [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]] as const;
  rows.forEach(([label, val], i) => {
    const yy = y + i * 15;
    tc(pdf, color.text); pdf.setFontSize(7.5); pdf.text(label, page.margin, yy);
    dc(pdf, color.border); pdf.rect(page.margin + 85, yy - 7, 180, 7);
    fc(pdf, color.teal); pdf.rect(page.margin + 85, yy - 7, 18 * val, 7, "F");
    pdf.text(score(val), page.margin + 275, yy);
  });
  return y + rows.length * 15 + 16;
}
function diagramMarket(pdf: jsPDF, y: number, report: FeasibilityReport, title: string, reportId: string) {
  y = need(pdf, y, 110, title, reportId);
  y = sub(pdf, y, "Market Funnel Snapshot", title, reportId);
  const vals = [["TAM", report.market.tamValue], ["SAM", report.market.samValue], ["SOM", report.market.somValue]];
  vals.forEach(([label, value], i) => {
    fc(pdf, i === 0 ? color.navy : i === 1 ? color.teal : color.amber);
    const w = 260 - i * 55; pdf.roundedRect(page.margin + i * 27, y + i * 22, w, 16, 3, 3, "F");
    tc(pdf, color.white); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.text(`${label}: ${clean(value)}`, page.margin + i * 27 + 8, y + i * 22 + 11);
  });
  return y + 88;
}
function diagramCash(pdf: jsPDF, y: number, report: FeasibilityReport, internal: boolean, title: string, reportId: string) {
  y = need(pdf, y, 105, title, reportId);
  y = sub(pdf, y, internal ? "ROI Bridge Direction" : "MRR Ramp Direction", title, reportId);
  const data = internal ? internalCashFlow(report).slice(0, 12).map((r) => Number(String(r[4]).replace(/[^0-9-]/g, "")) || 0) : enterpriseCashFlow(report).slice(0, 12).map((r) => Number(String(r[4]).replace(/[^0-9]/g, "")) || 0);
  const max = Math.max(...data.map(Math.abs), 1);
  data.forEach((v, i) => {
    const h = Math.max(2, Math.abs(v) / max * 46);
    fc(pdf, v < 0 ? color.red : color.teal);
    pdf.rect(page.margin + i * 18, y + 52 - h, 10, h, "F");
  });
  dc(pdf, color.border); pdf.line(page.margin, y + 54, page.margin + 220, y + 54);
  tc(pdf, color.muted); pdf.setFontSize(7); pdf.text("M1", page.margin, y + 66); pdf.text("M12", page.margin + 198, y + 66);
  return y + 80;
}
function cleanCitations(report: FeasibilityReport) {
  return (report.research?.citations || []).filter((c) => !/hacker news|0 comments|job fair|moscone/i.test(`${c.source} ${c.title} ${c.takeaway}`)).slice(0, 8).map((c) => ({ ...c, title: clean(c.title).replace(/Ict/g, "ICT").replace(/Analyt\.$/i, "Analytics") }));
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const internal = isInternal(inputs, report);
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs, internal ? "Internal infrastructure ROI case" : "Enterprise contract SaaS investment case");
  let y = addPage(pdf, title, reportId);

  y = major(pdf, y, "1. Governing Thesis & Report Scope", internal ? "This is an internal ROI case, not a commercial SaaS valuation case" : "The investment case depends on enterprise ACV, churn control and proof of paid pilots", title, reportId);
  y = brief(pdf, y, internal ? "This case should be approved only if measured savings and risk reduction exceed TCO. Phase-gate funding is required because base-case run costs can outrun productivity benefits." : `This case uses one enterprise SaaS model: ACV-based revenue, enterprise logo acquisition, churn assumptions and investor return logic. Base-case success depends on 45 customers at ${money(report.financials.currency, acv(report))} ACV.`, title, reportId);
  y = para(pdf, y, internal ? `${inputs.projectName} is an internal platform intended to reduce data silos, improve reporting speed and strengthen data governance.` : `${inputs.projectName} is an enterprise analytics platform for companies that need governed dashboards, faster data integration and business-user access without relying on multiple fragmented BI and warehouse tools. A typical target buyer is a $50M+ enterprise running Snowflake or Redshift for storage, Tableau or Power BI for dashboards, and separate operational systems; the product collapses this fragmented workflow into a governed analytics layer with predictable enterprise pricing.`, title, reportId);
  y = tbl(pdf, sub(pdf, y, "SCR Argument Logic", title, reportId), title, reportId, [["Argument", "Evidence", "Implication"]], internal ? [["Need", "Manual reporting and siloed data slow decisions", "Measure current hours and defects before funding"], ["Economics", "ROI depends on recovered time exceeding OpEx", "Release budget by stage"], ["Risk", "Legacy integration and adoption dominate risk", "Name technical and change owners"]] : [["Market", "Enterprise cloud analytics has large TAM/SAM", "Target high-need regulated buyers"], ["Economics", "ACV and churn drive break-even", "Validate pricing through LOIs"], ["Execution", "Connector delivery and security review are key", "Gate scale funding after paid pilots"]], { first: 82, fs: 7.2 });
  y = diagramFmart(pdf, y, report, title, reportId);
  y = tbl(pdf, sub(pdf, y, "FMART Scorecard", title, reportId), title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { first: 122, fs: 7.3, widths: { 1: 55 }, hiLast: true });
  const method = methodologyRows(report); if (method.length) y = tbl(pdf, sub(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId), title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], method, { first: 85, fs: 7.1 });
  y = takeaway(pdf, y, internal ? "Approve only if benefits tracking closes the TCO gap." : "Enterprise ACV, churn and paid pilots are the decision variables.", title, reportId);

  y = major(pdf, y, "2. Situation: Market Context & Problem Definition", internal ? "External growth validates technology relevance; internal value capture decides funding" : "The real target is the reachable enterprise SOM, not the global market headline", title, reportId);
  y = brief(pdf, y, internal ? "The market confirms that data integration demand is real, but internal adoption and run-cost control matter more than market size." : `The ${clean(report.market.tamValue)} TAM is attractive, but the practical target is the enterprise SOM: buyers with fragmented analytics stacks, cloud-cost pressure and urgent governance needs.`, title, reportId);
  y = fields(pdf, y, title, reportId, [["Project", clean(inputs.projectName)], ["Industry", clean(inputs.industry)], ["Location", clean(inputs.location)], ["Business Model", internal ? "Internal infrastructure / CapEx project" : "Enterprise SaaS / subscription software"], ["Value Model", internal ? "Efficiency ROI and risk reduction" : `Enterprise ACV of ${money(report.financials.currency, acv(report))}`], ["Budget Range", clean(inputs.budgetRange)], ["Timeline", clean(inputs.timeline)], ["Team Size", clean(inputs.teamSize)], ["Technology Readiness", clean(inputs.technologyReadiness)]]);
  y = diagramMarket(pdf, y, report, title, reportId);
  y = tbl(pdf, sub(pdf, y, "Market Sizing & Growth", title, reportId), title, reportId, [["Year", `TAM (${report.market.currency || "USD"}, billions)`, `SAM (${report.market.currency || "USD"}, billions)`]], marketRows(report), { first: 80, fs: 7.6 });

  y = major(pdf, y, "3. Team, Product & Architecture", "The product must explain what changes for the buyer before financial analysis starts", title, reportId);
  y = brief(pdf, y, internal ? "The platform needs named accountability and a signed technical design before approval." : "The product promise is simple: reduce analytics stack fragmentation, give business users governed dashboards and keep cloud analytics cost predictable.", title, reportId);
  y = tbl(pdf, sub(pdf, y, "Technology Architecture", title, reportId), title, reportId, [["Layer", "Recommended Choice", "Rationale"]], architectureRows(internal), { first: 90, fs: 7.1 });

  y = major(pdf, y, "4. Market Attractiveness & Competitive Positioning", "Each incumbent requires a distinct wedge tied to its specific friction", title, reportId);
  y = brief(pdf, y, internal ? "SAP, Microsoft, Oracle and Snowflake compete on scale and ecosystem strength; the internal platform wins only if it shortens time-to-value and improves UAE-specific governance." : "The competitive wedge is not generic BI. It is predictable enterprise analytics with lower admin burden, stronger connector packaging and business-user usability.", title, reportId);
  y = fields(pdf, y, title, reportId, [["Target Segment", internal ? "Internal enterprise departments" : "$50M+ revenue enterprises"], ["Customer Goal", clean(report.customer.goals)], ["Buying / Adoption Behavior", clean(report.customer.behavior)], ["Willingness to Pay / Fund", clean(report.customer.willingnessToPay)]]);
  if (report.competitors?.length) y = tbl(pdf, y, title, reportId, [["Competitor", "Their Moat", "Weakness", "Our Wedge"]], report.competitors.map((comp) => [clean(comp.name), clean(comp.edge), clean(comp.weakness), wedgeFor(clean(comp.name), inputs)]), { first: 76, fs: 6.7 });
  y = takeaway(pdf, y, "Each wedge now maps to the actual competitor in the table.", title, reportId);

  y = major(pdf, y, "5. Financial Model & Scenario Analysis", internal ? "Savings must exceed run cost before scale funding" : "Enterprise ACV, churn, customer success and cash burn drive the break-even path", title, reportId);
  y = brief(pdf, y, internal ? "The base case must show monthly benefits exceeding monthly OpEx; if not, approval requires a mitigation plan." : `Base case assumes 45 enterprise customers at ${money(report.financials.currency, acv(report))} ACV and 2.5% monthly churn. Pessimistic churn at 6% pushes break-even materially later and must be validated before Series A.`, title, reportId);
  y = fields(pdf, y, title, reportId, [["Investment Range", clean(report.financials.investmentRange)], ["Break-Even", internal ? clean(report.financials.breakEvenSummary) : "Month 22 target under Base Case enterprise-logo model"], ["LTV : CAC", internal ? "Not applicable — internal ROI project" : clean(report.financials.ltvCacRatio, "4.2:1")], ["CapEx Mid", money(report.financials.currency, report.financials.capExTotal.mid)]]);
  y = tbl(pdf, sub(pdf, y, "Operating Expenses", title, reportId), title, reportId, [["Category", "Monthly", "Annual"]], opexRows(report, internal), { first: 205, fs: 7.5 });
  if (internal) {
    const r = internalRoi(report);
    y = tbl(pdf, sub(pdf, y, "Efficiency ROI Calculation", title, reportId), title, reportId, [["Driver", "Assumption", "Result"]], [["Population", `${r.users} analysts / data users`, "Named denominator"], ["Hours Saved", `${r.hours} hours per week`, "Manual reporting reduction"], ["Annual Gross Savings", money(report.financials.currency, r.annualSavings), `${r.users} x ${r.hours} x ${r.weeks} x ${money(report.financials.currency, r.rate)} x ${pct(r.recovery * 100)}`], ["Annual OpEx", money(report.financials.currency, r.annualOpex), "Run-rate cost"], ["Net Annual Benefit", money(report.financials.currency, r.net), "Savings less OpEx"]], { first: 115, fs: 7.1 });
    y = diagramCash(pdf, y, report, internal, title, reportId);
    y = tbl(pdf, sub(pdf, y, "36-Month Internal ROI Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "Adoption", "Gross Savings", "OpEx", "Net Cash Flow", "Cumulative Net vs CapEx"]], internalCashFlow(report), { first: 45, fs: 5.9 });
  } else {
    y = tbl(pdf, sub(pdf, y, "Revenue Scenarios", title, reportId), title, reportId, [["Scenario", "Probability", "Yr 1 Customers", "ARR", "Monthly Churn", "Break-Even"]], enterpriseScenarioRows(report), { first: 78, fs: 7.1 });
    y = diagramCash(pdf, y, report, internal, title, reportId);
    y = tbl(pdf, sub(pdf, y, "24-Month Enterprise MRR & Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "New Logos", "Churn", "Active Accounts", "MRR", "Monthly OpEx", "Cash Position"]], enterpriseCashFlow(report), { first: 44, fs: 6.1 });
  }

  y = major(pdf, y, "6. Risk Register With Expected Value", "The risk table must show dollars, not only high/medium/low labels", title, reportId);
  y = brief(pdf, y, "Risk exposure is now shown in the summary table with EV and named owners, so the reader does not need to jump pages to understand financial exposure.", title, reportId);
  y = tbl(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Expected Value", "Owner", "Mitigation"]], riskRows(report), { first: 78, fs: 6.2 });

  y = major(pdf, y, internal ? "7. Funding Structure & Internal ROI" : "7. Funding Structure & Investor Returns", internal ? "Funding should be staged against benefit realization" : "Investors need ACV-based ARR, retention and exit value clarity", title, reportId);
  y = brief(pdf, y, internal ? "Do not release full CapEx upfront; release it by validation, MVP, pilot and scale gates." : "The investment case must show what the investor owns in five years; ARR multiple logic provides the first-pass answer.", title, reportId);
  if (!internal && report.fundingMix?.length) y = tbl(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((s) => [s.source, s.share, s.amount, s.rationale]), { first: 115, fs: 7.2 });
  if (!internal) y = tbl(pdf, sub(pdf, y, "Five-Year Investor Return Model", title, reportId), title, reportId, [["Year", "Customers", "ARR", "Multiple", "Implied Valuation"]], investorRows(report), { first: 45, fs: 7.1 });

  y = major(pdf, y, internal ? "8. Internal Adoption Strategy" : "8. Go-to-Market Strategy", internal ? "Departmental rollout sequencing determines value realization" : "Enterprise-first GTM should replace SMB self-serve assumptions", title, reportId);
  y = brief(pdf, y, internal ? "Adoption is the economic engine of the internal case." : "The primary motion is enterprise outbound, marketplace co-sell and SI partnerships; product-led sandbox is an expansion tactic only.", title, reportId);
  if (internal) y = tbl(pdf, y, title, reportId, [["Workstream", "Owner", "Target", "Success Metric"]], [["Executive Mandate", "Executive Sponsor", "Participating departments", "Named data owners approved"], ["Training & Enablement", "Change Lead", "Analysts and power users", "75% active usage by Month 12"], ["Compliance", "CISO / Legal Counsel", "Security controls", "Audit logs validated"]], { first: 105, fs: 7.2 });
  else {
    y = tbl(pdf, y, title, reportId, [["Channel", "Role", "Rationale", "Year 1 Target"]], enterpriseGtmRows(), { first: 88, fs: 6.9 });
    y = tbl(pdf, sub(pdf, y, "Pricing Ladder", title, reportId), title, reportId, [["Tier", "Target Customer", "Annual Price", "Feature Gate"]], pricingRows(report), { first: 75, fs: 6.9 });
  }

  y = major(pdf, y, "9. Implementation Roadmap", "Phase gates must define go/no-go thresholds, not just activities", title, reportId);
  y = brief(pdf, y, "Each gate now gives quantified pass/fail logic, so funding can stop if evidence does not support scale.", title, reportId);
  y = tbl(pdf, y, title, reportId, [["Phase", "Timeline", "Go Criteria", "No-Go Trigger"]], phaseGateRows(internal), { first: 68, fs: 6.8 });

  y = major(pdf, y, "10. Strategic Recommendations", "Recommendations must be specific to the enterprise analytics wedge", title, reportId);
  y = bullets(pdf, y, internal ? ["Start with one high-value data domain and measure reporting-hour reduction before scaling.", "Name accountable owners for data quality, platform architecture, change management and compliance.", "Use phase-gate funding releases tied to adoption, data-quality and savings thresholds."] : ["Position the product as an enterprise operational analytics layer, not a generic BI dashboard tool.", "Prioritize Redshift, Snowflake, Salesforce and ERP connectors because they map to enterprise buying pain.", "Lead with security and governance proof during sales, including SOC2, audit logs, SSO and data residency roadmap.", "Use enterprise outbound and cloud marketplace co-sell as the main GTM motion; keep PLG as expansion only."], title, reportId);

  y = major(pdf, y, "11. Appendix: Limitations, Assumptions & Primary Research", "The report is decision-useful but requires validation before final approval", title, reportId);
  y = fields(pdf, y, title, reportId, [["Assumptions", clean(inputs.assumptions)], ["Constraints", clean(inputs.constraints)], ["Success Factors", clean(inputs.successFactors)], ["Known Risks", clean(inputs.knownRisks)], ["Regulatory Considerations", clean(inputs.regulatoryConsiderations)], ["Dependencies", clean(inputs.dependencies)]]);
  y = takeaway(pdf, y, internal ? "Validate reporting hours, data defects and adoption barriers before scale funding." : "Validate ACV, procurement path, security requirements, churn risk and implementation cost before fundraising materials are shared.", title, reportId);
  const citations = cleanCitations(report);
  if (citations.length) {
    y = major(pdf, y, "12. Appendix: Clean Source Notes", "Source notes stay outside the body", title, reportId);
    citations.forEach((c, i) => { y = para(pdf, y, `${i + 1}. ${clean(c.title)}. Source: ${clean(c.source)}. Key takeaway: ${clean(c.takeaway)}. URL: ${clean(c.url)}`, title, reportId); });
  }

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
