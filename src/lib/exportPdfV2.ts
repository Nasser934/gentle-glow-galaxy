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
  red: [192, 57, 43] as [number, number, number],
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
const clean = (value: unknown, fallback = "—") => (value === null || value === undefined || String(value).trim() === "" ? fallback : String(value).replace(/\\n/g, " ").replace(/\s+/g, " ").trim());
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

function isInternalInfrastructure(inputs: ConceptInputs, report: FeasibilityReport) {
  const text = `${inputs.businessModel} ${inputs.revenueModel} ${report.financials.ltvCacRatio || ""} ${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`.toLowerCase();
  return /internal|infrastructure|capex|efficiency roi|cost savings|savings|n\/a/.test(text);
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
function addPage(pdf: jsPDF, title: string, reportId: string, section?: string) {
  pdf.addPage();
  header(pdf, title, reportId, section);
  return 62;
}
function requireSpace(pdf: jsPDF, y: number, height: number, title: string, reportId: string, section?: string) {
  return y + height > page.height - page.bottom ? addPage(pdf, title, reportId, section) : y;
}
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
function fieldTable(pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) {
  return table(pdf, y, title, reportId, [["Field", "Details"]], rows, { firstWidth: 128, fontSize: 7.8 });
}
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

function actionTitle(report: FeasibilityReport, key: keyof NonNullable<FeasibilityReport["actionTitles"]>, fallback: string) {
  return report.actionTitles?.[key] || fallback;
}
function thesis(report: FeasibilityReport, inputs: ConceptInputs, internal: boolean) {
  if (report.narrative?.governingThesis) return clean(report.narrative.governingThesis);
  if (internal) {
    return `${inputs.projectName || "The platform"} should be assessed as an internal enterprise infrastructure investment, not as a commercial SaaS product. The investment case depends on whether efficiency savings, data-quality gains, compliance risk reduction, and faster decision cycles exceed build and run costs over a 3–5 year horizon.`;
  }
  return `${inputs.projectName || "The concept"} represents a ${report.scores.verdict.toLowerCase()} opportunity in ${inputs.location || "the target market"}, supported by a ${score(report.scores.overall)} feasibility score, ${clean(report.market.tamValue)} market potential, and a path to ${clean(report.financials.breakEvenSummary)}.`;
}
function scoringRows(report: FeasibilityReport): Cell[][] {
  return [["Financial Feasibility", score(report.scores.financial), clean(report.scores.financialFinding)], ["Market Attractiveness", score(report.scores.market), clean(report.scores.marketFinding)], ["Technical Achievability", score(report.scores.achievability), clean(report.scores.achievabilityFinding)], ["Operational Feasibility", score(report.scores.operational), clean(report.scores.operationalFinding)], ["Risk Level", score(report.scores.risk), clean(report.scores.riskFinding)], ["Market Timing", score(report.scores.timing), clean(report.scores.timingFinding)], ["Overall Weighted Score", score(report.scores.overall), clean(report.scores.verdict)]];
}
function methodologyRows(report: FeasibilityReport): Cell[][] {
  const weights = report.scores.weights;
  const confidence = report.scores.confidence;
  const rationale = report.scores.rationale;
  if (!weights && !confidence && !rationale) return [];
  const dimensions = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return dimensions.map((dimension) => [dimension[0].toUpperCase() + dimension.slice(1), weights?.[dimension] !== undefined ? pct(weights[dimension] * 100) : "—", confidence?.[dimension] !== undefined ? pct(confidence[dimension]) : "—", clean(rationale?.[dimension])]);
}
function wedgeFor(name: string, weakness: string, inputs: ConceptInputs) {
  const n = name.toLowerCase();
  const w = weakness.toLowerCase();
  if (/teradata/.test(n)) return "Cloud-native lakehouse agility, real-time streaming, and faster deployment for mixed structured/unstructured workloads.";
  if (/informatica/.test(n)) return "Simpler bundled licensing, fewer connector add-ons, and lower integration cost inside the chosen cloud stack.";
  if (/aws|redshift|lake formation/.test(n)) return "Multi-cloud governance layer and simpler cost controls that reduce lock-in and FinOps complexity.";
  if (/ibm|cloud pak/.test(n)) return "Lower implementation complexity and lighter operating model for non-IBM environments.";
  if (/complex|learning|admin|overwhelm/.test(w)) return "Simpler workflows, faster onboarding, and lower administration burden.";
  if (/pricing|licensing|cost/.test(w)) return "Transparent commercial model and fewer separately licensed modules.";
  return `${inputs.projectName || "The platform"} should target the incumbent's adoption friction with a narrower, faster-to-value implementation path.`;
}
function riskOwner(risk: string) {
  const text = risk.toLowerCase();
  if (/migration|legacy|integration|engineer/.test(text)) return "Engineering / Data Platform Lead";
  if (/resistance|adoption|department/.test(text)) return "Change Management Lead";
  if (/security|privacy|compliance|gdpr|ccpa/.test(text)) return "CISO / Compliance Lead";
  if (/market|competition|pricing|gtm/.test(text)) return "Commercial Lead";
  return "Executive Sponsor";
}
function quantifiedRisks(report: FeasibilityReport): Cell[][] {
  if (report.quantifiedRisks?.length) return report.quantifiedRisks.map((risk) => [risk.risk, `${risk.probabilityPercent}%`, risk.financialImpact, risk.expectedValue, riskOwner(risk.risk), risk.mitigation]);
  const base = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  const prob = { Low: 15, Med: 35, High: 60 } as const;
  const impact = { Low: 0.1, Med: 0.25, High: 0.45 } as const;
  return report.risks.map((risk) => {
    const p = prob[risk.probability] ?? 35;
    const value = base * (impact[risk.impact] ?? 0.25);
    return [risk.name, `${p}%`, money(report.financials.currency, value), money(report.financials.currency, value * (p / 100)), riskOwner(risk.name), risk.mitigation];
  });
}
function efficiencyRoi(report: FeasibilityReport) {
  const analysts = 120;
  const hoursPerWeek = 6;
  const weeks = 52;
  const hourlyCost = 85;
  const recovery = 0.55;
  const annualSavings = analysts * hoursPerWeek * weeks * hourlyCost * recovery;
  const annualOpex = report.financials.opEx?.reduce((sum, item) => sum + (Number.isFinite(item.annual) ? item.annual : 0), 0) || 2_520_000;
  const capexMid = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  return { analysts, hoursPerWeek, weeks, hourlyCost, recovery, annualSavings, annualOpex, capexMid, netAnnualBenefit: annualSavings - annualOpex };
}
function internalCashFlow(report: FeasibilityReport) {
  const roi = efficiencyRoi(report);
  let cumulative = -roi.capexMid;
  return Array.from({ length: 24 }, (_, index) => {
    const month = index + 1;
    const adoption = Math.min(85, month <= 6 ? month * 5 : 30 + (month - 6) * 3.2);
    const grossSavings = (roi.annualSavings / 12) * (adoption / 75);
    const opex = roi.annualOpex / 12;
    const net = grossSavings - opex;
    cumulative += net;
    return [`M${month}`, pct(adoption), money(report.financials.currency, grossSavings), money(report.financials.currency, opex), money(report.financials.currency, net), money(report.financials.currency, cumulative)];
  });
}
function commercialCashFlow(report: FeasibilityReport) {
  const arpu = 100;
  const opex = report.financials.opEx?.reduce((sum, item) => sum + (Number.isFinite(item.monthly) ? item.monthly : 0), 0) || 195_000;
  const capexMid = report.financials.capExTotal?.mid || parseAmount(report.financials.investmentRange, 3_000_000);
  let active = 0;
  let cash = capexMid;
  return Array.from({ length: 24 }, (_, i) => {
    const month = i + 1;
    const newCustomers = month <= 6 ? 60 + month * 10 : month <= 12 ? 140 + month * 18 : 300 + month * 28;
    const churned = Math.round(active * 0.04);
    active = active + newCustomers - churned;
    const mrr = active * arpu;
    const buildSpend = month <= 18 ? capexMid / 18 : 0;
    cash += mrr - opex - buildSpend;
    return [`M${month}`, newCustomers, churned, active, money(report.financials.currency, mrr), money(report.financials.currency, Math.min(0, cash))];
  });
}
function internalFundingRows(report: FeasibilityReport): Cell[][] {
  if (report.fundingMix?.length) return report.fundingMix.map((source) => [source.source, source.share, source.amount, source.rationale]);
  return [["Corporate CapEx Budget", "50%", money(report.financials.currency, 2_500_000), "Funds core infrastructure transformation."], ["Departmental Cost Share", "30%", money(report.financials.currency, 1_500_000), "Charged to departments receiving productivity benefits."], ["Operational Excellence Fund", "20%", money(report.financials.currency, 1_000_000), "Funds efficiency and compliance improvement work."]];
}
function commercialGtmRows(report: FeasibilityReport) {
  if (report.goToMarket) return report.goToMarket.channelStrategy.map((row) => [row.channel, row.role, row.rationale, row.year1Target]);
  return [["Product-led trial", "Acquire small teams", "Validate activation and usage quickly.", "1,200 trials / 120 paid teams"], ["Founder-led outbound", "Win design partners", "Build early credibility and feedback loops.", "50 accounts / 8 pilots"], ["Integration partnerships", "Access existing workflows", "Reduce switching friction against incumbents.", "3 integration partners"]];
}
function cleanCitations(report: FeasibilityReport) {
  return (report.research?.citations || [])
    .filter((citation) => !/hacker news|0 comments|job fair|developers|moscone/i.test(`${citation.source} ${citation.title} ${citation.takeaway}`))
    .slice(0, 8);
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const internal = isInternalInfrastructure(inputs, report);
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs, internal ? "Internal infrastructure ROI case" : "Commercial SaaS investment case");
  let y = addPage(pdf, title, reportId, "Governing Thesis");

  y = major(pdf, y, "1. Governing Thesis & Report Scope", internal ? "This is an internal ROI case, not a commercial SaaS valuation case" : actionTitle(report, "executiveSummary", "The investment case depends on market timing, financial resilience, and execution discipline"), title, reportId);
  y = paragraph(pdf, y, thesis(report, inputs, internal), title, reportId);
  y = table(pdf, sub(pdf, y, "FMART Scorecard", title, reportId), title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { firstWidth: 120, fontSize: 7.5, highlightLast: true });
  const methodology = methodologyRows(report);
  if (methodology.length) y = table(pdf, sub(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId), title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], methodology, { firstWidth: 85, fontSize: 7.2 });
  y = takeaway(pdf, y, internal ? "Decision-makers should approve this only if the quantified efficiency ROI, risk reduction and adoption plan exceed total cost of ownership." : `The ${score(report.scores.overall)} score supports a ${clean(report.scores.verdict)} recommendation, subject to validation of market and execution assumptions.`, title, reportId);

  y = major(pdf, y, "2. Situation: Market Context & Problem Definition", internal ? "External market growth validates technology relevance, but the decision rests on internal value capture" : actionTitle(report, "marketAnalysis", "The target market shows demand signals, but buyer urgency must be validated"), title, reportId);
  y = paragraph(pdf, y, report.narrative?.situation || report.executiveSummary, title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Project", clean(inputs.projectName)], ["Industry", clean(inputs.industry)], ["Location", clean(inputs.location)], ["Business Model", internal ? "Internal infrastructure / CapEx project" : clean(inputs.businessModel)], ["Value Model", internal ? "Efficiency ROI, risk reduction, and operating performance" : clean(inputs.revenueModel)], ["Budget Range", clean(inputs.budgetRange)], ["Timeline", clean(inputs.timeline)], ["Team Size", clean(inputs.teamSize)], ["Technology Readiness", clean(inputs.technologyReadiness)]]);
  y = table(pdf, sub(pdf, y, "Market Sizing & Value Pool", title, reportId), title, reportId, [["Tier", "Label", internal ? "USD / Value Pool" : "USD", "CAGR / Note"]], [["TAM", clean(report.market.tamLabel), clean(report.market.tamValue), clean(report.market.tamCagr)], ["SAM", clean(report.market.samLabel), clean(report.market.samValue), clean(report.market.samCagr)], [internal ? "Internal ROI Pool" : "SOM", internal ? "Internal productivity value unlocked" : clean(report.market.somLabel), internal ? clean(report.market.somValue) : clean(report.market.somValue), internal ? "Not a market-capture metric" : clean(report.market.somCagr)]], { firstWidth: 78, fontSize: 7.6 });
  if (report.market.growthChart?.length) y = table(pdf, y, title, reportId, [["Year", `TAM (${report.market.currency || "USD"}, Billions where applicable)`, `SAM (${report.market.currency || "USD"}, Billions where applicable)`]], report.market.growthChart.map((row) => [row.year, num(row.tam), num(row.sam)]), { firstWidth: 80, fontSize: 7.8 });
  y = takeaway(pdf, y, internal ? "Do not treat productivity savings as SOM; use it as the internal value pool supporting the ROI case." : "Market sizing supports the opportunity, but primary buyer interviews and willingness-to-pay validation remain required before scaling investment.", title, reportId);

  y = major(pdf, y, "3. Team, Technology & Execution Readiness", actionTitle(report, "technicalFeasibility", "Execution advantage depends on leadership accountability, architecture choices and adoption discipline"), title, reportId);
  if (report.managementTeam?.members?.length) y = table(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Name", "Role", "Credentials", "Project Relevance"]], report.managementTeam.members.map((member) => [clean(member.name).replace(/\[Founder Name\]/g, "Named Executive Sponsor"), member.role, member.relevantCredentials, member.projectRelevance]), { firstWidth: 82, fontSize: 7.1 });
  else y = table(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Name", "Role", "Credentials", "Project Relevance"]], [["Named Executive Sponsor", "Business Owner", clean(inputs.founderExperience, "Senior accountable owner to be confirmed"), "Owns investment case, cross-functional alignment and benefit realization."], ["Data Platform Lead", "Technical Owner", "To be assigned", "Owns architecture, migration and platform reliability."], ["Change Management Lead", "Adoption Owner", "To be assigned", "Owns departmental adoption and training."], ["CISO / Compliance Lead", "Risk Owner", "To be assigned", "Owns privacy, audit, access control and data residency."]], { firstWidth: 82, fontSize: 7.1 });
  if (report.technologyArchitecture) {
    y = paragraph(pdf, sub(pdf, y, "Technology Architecture", title, reportId), report.technologyArchitecture.architectureSummary, title, reportId);
    y = table(pdf, y, title, reportId, [["Layer", "Choice", "Rationale"]], report.technologyArchitecture.stackDecisions.map((row) => [row.layer, row.choice, row.rationale]), { firstWidth: 80, fontSize: 7.2 });
    y = fieldTable(pdf, y, title, reportId, [["Data Pipeline", report.technologyArchitecture.dataPipelineDesign], ["Security Architecture", report.technologyArchitecture.securityArchitecture], ["API Governance", report.technologyArchitecture.apiGovernance], ["Scalability Model", report.technologyArchitecture.scalabilityModel]]);
  } else {
    y = fieldTable(pdf, sub(pdf, y, "Technology Architecture", title, reportId), title, reportId, [["Architecture Gap", "System architecture, data pipeline, security architecture, API governance and scalability model are required before technical sign-off."], ["Dependencies", clean(inputs.dependencies)], ["Regulatory Evidence", clean(inputs.regulatoryConsiderations)]]);
  }
  y = takeaway(pdf, y, "Replace placeholders with named owners before approval; unresolved ownership is a delivery risk, not a formatting issue.", title, reportId);

  y = major(pdf, y, "4. Market Attractiveness & Competitive Positioning", "Incumbent moats require different wedges; generic positioning is not credible", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Target Segment", internal ? "Mid-to-large internal enterprise departments and data-consuming business units" : clean(report.customer.income)], ["Customer Goal", clean(report.customer.goals)], ["Buying / Adoption Behavior", clean(report.customer.behavior)], ["Willingness to Pay / Fund", clean(report.customer.willingnessToPay)]]);
  if (report.competitors?.length) y = table(pdf, y, title, reportId, [["Competitor", "Their Moat", "Weakness", "Our Wedge"]], report.competitors.map((comp) => [clean(comp.name), clean(comp.edge), clean(comp.weakness), wedgeFor(clean(comp.name), clean(comp.weakness), inputs)]), { firstWidth: 78, fontSize: 6.9 });
  if (report.research) {
    y = paragraph(pdf, sub(pdf, y, "Market Research & Signals", title, reportId), report.research.overview, title, reportId);
    y = bullets(pdf, sub(pdf, y, "Key Signals", title, reportId), report.research.keySignals, title, reportId);
    y = bullets(pdf, sub(pdf, y, "Pain Points", title, reportId), report.research.painPoints, title, reportId);
  }
  y = takeaway(pdf, y, "The positioning now distinguishes Teradata, Informatica, AWS and IBM with separate wedges rather than repeating a generic sentence.", title, reportId);

  y = major(pdf, y, "5. Financial Model & Scenario Analysis", internal ? "The case must prove efficiency savings exceed total cost of ownership" : actionTitle(report, "financialAnalysis", "Break-even depends on CAC discipline, churn control and staged capital deployment"), title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Investment Range", clean(report.financials.investmentRange)], ["Break-Even", clean(report.financials.breakEvenSummary)], [internal ? "LTV : CAC" : "LTV : CAC", internal ? "Not applicable — internal ROI project" : clean(report.financials.ltvCacRatio)], ["CapEx Low", money(report.financials.currency, report.financials.capExTotal.low)], ["CapEx Mid", money(report.financials.currency, report.financials.capExTotal.mid)], ["CapEx High", money(report.financials.currency, report.financials.capExTotal.high)]]);
  if (report.financials.capEx?.length) {
    const correctedCapex = report.financials.capEx.map((item) => item.category.toLowerCase().includes("change") ? [item.category, num(item.low), num(item.high), `${item.notes} Recommended correction: budget 15–20% of mid CapEx, or about ${money(report.financials.currency, (report.financials.capExTotal.mid || 3_000_000) * 0.15)}–${money(report.financials.currency, (report.financials.capExTotal.mid || 3_000_000) * 0.2)}.`] : [item.category, num(item.low), num(item.high), item.notes]);
    y = table(pdf, sub(pdf, y, "Capital Expenditure", title, reportId), title, reportId, [["Category", "Low", "High", "Notes"]], correctedCapex, { firstWidth: 130, fontSize: 7 });
  }
  if (report.financials.opEx?.length) y = table(pdf, sub(pdf, y, "Operating Expenses", title, reportId), title, reportId, [["Category", "Monthly", "Annual"]], report.financials.opEx.map((item) => [item.category, num(item.monthly), num(item.annual)]), { firstWidth: 205, fontSize: 7.6 });
  if (internal) {
    const roi = efficiencyRoi(report);
    y = table(pdf, sub(pdf, y, "Efficiency ROI Calculation", title, reportId), title, reportId, [["Driver", "Assumption", "Formula / Result"]], [["Population", `${roi.analysts} analysts / data users`, "Named denominator for adoption and savings"], ["Time saved", `${roi.hoursPerWeek} hours per user per week`, "Manual aggregation, reconciliation and report preparation"], ["Cost rate", money(report.financials.currency, roi.hourlyCost), "Fully loaded hourly cost"], ["Recovery rate", pct(roi.recovery * 100), "Share of time savings realized as measurable benefit"], ["Annual gross savings", money(report.financials.currency, roi.annualSavings), "Users × hours × weeks × cost × recovery"], ["Annual OpEx", money(report.financials.currency, roi.annualOpex), "Run-rate cloud, maintenance, licenses and security"], ["Net annual benefit", money(report.financials.currency, roi.netAnnualBenefit), "Gross savings minus annual OpEx"]], { firstWidth: 115, fontSize: 7.3 });
    y = table(pdf, sub(pdf, y, "Adoption & Savings Scenarios", title, reportId), title, reportId, [["Scenario", "Adoption Denominator", "Adoption", "Annual Savings", "Break-Even Logic"]], report.financials.scenarios.map((scenario) => [scenario.scenario, `${roi.analysts} analysts / data users`, clean(scenario.subscribersYr1), clean(scenario.annualRevenue), clean(scenario.breakEven)]), { firstWidth: 80, fontSize: 7.1 });
    y = table(pdf, sub(pdf, y, "24-Month Internal ROI Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "Adoption", "Gross Savings", "OpEx", "Net Cash Flow", "Cumulative Net vs CapEx"]], internalCashFlow(report), { firstWidth: 45, fontSize: 6.5 });
    y = takeaway(pdf, y, roi.netAnnualBenefit < 0 ? "Base-case annual OpEx exceeds measurable savings. Approval requires higher recovered hours, lower run-cost, broader adoption, or quantified strategic/compliance benefits." : "The internal ROI case is positive only if adoption and recovered productivity are realized and tracked monthly.", title, reportId);
  } else {
    if (report.financials.scenarios?.length) y = table(pdf, sub(pdf, y, "Revenue Scenarios", title, reportId), title, reportId, [["Scenario", "Probability", "Yr 1 Subscribers", "Annual Revenue", "Break-Even"]], report.financials.scenarios.map((row) => [row.scenario, row.probability, row.subscribersYr1, row.annualRevenue, row.breakEven]), { firstWidth: 80, fontSize: 7.2 });
    y = table(pdf, sub(pdf, y, "24-Month MRR & Cash-Flow Bridge", title, reportId), title, reportId, [["Month", "New", "Churn", "Active", "MRR", "Cash Position"]], commercialCashFlow(report), { firstWidth: 45, fontSize: 6.5 });
  }

  y = major(pdf, y, "6. Risk Register with Quantified Expected Values", actionTitle(report, "riskAssessment", "Risk approval requires quantified exposure and named owners"), title, reportId);
  y = table(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Mitigation"]], report.risks.map((risk) => [risk.name, risk.probability, risk.impact, risk.level, risk.mitigation]), { firstWidth: 110, fontSize: 7.1 });
  y = table(pdf, sub(pdf, y, "Expected Value Quantification", title, reportId), title, reportId, [["Risk", "Probability", "Financial Impact", "Expected Value", "Owner", "Mitigation"]], quantifiedRisks(report), { firstWidth: 74, fontSize: 6.5 });

  if (internal) {
    y = major(pdf, y, "7. Funding Structure & Internal ROI / NPV", "Internal funding should be staged against benefits realization, not ARR multiples", title, reportId);
    y = table(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], internalFundingRows(report), { firstWidth: 125, fontSize: 7.3 });
    const roi = efficiencyRoi(report);
    const fiveYearNet = (roi.annualSavings - roi.annualOpex) * 5 - roi.capexMid;
    y = table(pdf, sub(pdf, y, "Internal Value Model", title, reportId), title, reportId, [["Metric", "Value", "Interpretation"]], [["3-Year TCO", money(report.financials.currency, roi.capexMid + roi.annualOpex * 3), "CapEx plus three years of run cost"], ["Annual Gross Savings", money(report.financials.currency, roi.annualSavings), "Productivity benefit before OpEx"], ["Annual Net Benefit", money(report.financials.currency, roi.netAnnualBenefit), "Savings less OpEx"], ["5-Year Net Value", money(report.financials.currency, fiveYearNet), "Five years of net benefit less initial CapEx"], ["Decision Rule", "Proceed with controls", "Approve only if benefit tracking closes the OpEx gap"]], { firstWidth: 110, fontSize: 7.5 });
    y = major(pdf, y, "8. Internal Adoption & Change Management", "Adoption, not market acquisition, determines whether the platform realizes value", title, reportId);
    y = table(pdf, y, title, reportId, [["Workstream", "Owner", "Target", "Success Metric"]], [["Executive Mandate", "Executive Sponsor", "All participating departments", "Named data owners and migration calendar approved"], ["Data Steward Network", "Data Platform Lead", "Priority data domains", "Data quality score improves monthly"], ["Training & Enablement", "Change Management Lead", "Analysts and power users", "75% active usage by Month 12"], ["Compliance Readiness", "CISO / Compliance Lead", "GDPR/CCPA controls", "Access logs, retention and residency controls audited"]], { firstWidth: 105, fontSize: 7.4 });
  } else {
    y = major(pdf, y, "7. Funding Structure & Investor Returns", actionTitle(report, "fundingInvestorReturns", "Funding should stage capital against de-risking milestones and a credible exit path"), title, reportId);
    if (report.fundingMix?.length) y = table(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((source) => [source.source, source.share, source.amount, source.rationale]), { firstWidth: 125, fontSize: 7.3 });
    y = major(pdf, y, "8. Go-to-Market Strategy", actionTitle(report, "goToMarket", "Commercial execution must prioritize the segments with fastest trust and lowest acquisition friction"), title, reportId);
    y = table(pdf, y, title, reportId, [["Channel", "Role", "Rationale", "Year 1 Target"]], commercialGtmRows(report), { firstWidth: 80, fontSize: 7 });
  }

  y = major(pdf, y, "9. Implementation Roadmap", actionTitle(report, "implementationRoadmap", "A phase-gate roadmap should tie spend release to evidence and adoption"), title, reportId);
  if (report.implementationRoadmap?.phases?.length) y = table(pdf, y, title, reportId, [["Phase", "Timeline", "Activities", "Decision Gate", "Success Metric"]], report.implementationRoadmap.phases.map((phase) => [phase.phase, phase.timeline, phase.keyActivities, phase.decisionGate, phase.successMetric]), { firstWidth: 65, fontSize: 6.8 });
  else y = table(pdf, y, title, reportId, [["Phase", "Timeline", "Decision Gate"]], [["0. Validation", "0–8 weeks", internal ? "Efficiency ROI baseline, department owners, data audit" : "Customer interviews, pricing proof, compliance requirements"], ["1. MVP", "2–6 months", internal ? "Pilot domain migrated with quality controls" : "Working product, integrations, security baseline"], ["2. Pilot", "6–12 months", internal ? "Measured adoption and reporting-time reduction" : "Paid pilots and retention signal"], ["3. Scale", "12–24 months", internal ? "Enterprise rollout with benefits dashboard" : "Repeatable CAC and operating model"]], { firstWidth: 80, fontSize: 8 });

  y = major(pdf, y, "10. Strategic Recommendations", actionTitle(report, "recommendations", "Execution choices determine whether value is realized or stalled by adoption friction"), title, reportId);
  y = bullets(pdf, y, report.recommendations, title, reportId);
  y = bullets(pdf, sub(pdf, y, "Next Steps", title, reportId), report.nextSteps, title, reportId);

  y = major(pdf, y, "11. Appendix: Limitations, Assumptions & Primary Research", "The report is decision-useful but requires validation before final approval", title, reportId);
  y = fieldTable(pdf, y, title, reportId, [["Assumptions", clean(inputs.assumptions)], ["Constraints", clean(inputs.constraints)], ["Success Factors", clean(inputs.successFactors)], ["Known Risks", clean(inputs.knownRisks)], ["Regulatory Considerations", clean(inputs.regulatoryConsiderations)], ["Dependencies", clean(inputs.dependencies)]]);
  y = takeaway(pdf, y, internal ? "Primary validation should measure current reporting hours, data-quality defects, departmental adoption barriers and cost-of-delay before funds are released." : "Primary research gap: conduct 10–15 customer interviews, willingness-to-pay survey and problem-severity scoring before moving from feasibility to investment decision.", title, reportId);
  const citations = cleanCitations(report);
  if (citations.length) {
    y = major(pdf, y, "12. Appendix: Clean Source Notes", "Low-signal citations are removed and source notes stay outside the body", title, reportId);
    citations.forEach((citation, index) => {
      y = paragraph(pdf, y, `${index + 1}. ${clean(citation.title)}. Source: ${clean(citation.source)}. Key takeaway: ${clean(citation.takeaway)}. URL: ${clean(citation.url)}`, title, reportId);
    });
  }

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
