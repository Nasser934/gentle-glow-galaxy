import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

type PdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };
type PdfExportPayload = { report: FeasibilityReport; inputs: ConceptInputs };
type Cell = string | number;

const page = { width: 595.28, height: 841.89, margin: 48, bottom: 62 };
const c = {
  navy: [0, 32, 96] as [number, number, number],
  blue: [0, 102, 204] as [number, number, number],
  teal: [0, 163, 161] as [number, number, number],
  text: [26, 26, 46] as [number, number, number],
  muted: [88, 96, 112] as [number, number, number],
  border: [213, 216, 220] as [number, number, number],
  stripe: [242, 243, 244] as [number, number, number],
  highlight: [254, 249, 231] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const txt = (pdf: jsPDF, color: [number, number, number]) => pdf.setTextColor(...color);
const fill = (pdf: jsPDF, color: [number, number, number]) => pdf.setFillColor(...color);
const draw = (pdf: jsPDF, color: [number, number, number]) => pdf.setDrawColor(...color);
const lastY = (pdf: jsPDF, y: number) => (pdf as PdfWithAutoTable).lastAutoTable?.finalY ?? y;
const clean = (v: unknown, f = "—") => (v === null || v === undefined || String(v).trim() === "" ? f : String(v).trim());
const score = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} / 10` : "—");
const num = (v: number) => (Number.isFinite(v) ? v.toLocaleString() : "—");
const money = (cur: string, v: number) => (Number.isFinite(v) ? `${cur || "USD"} ${v.toLocaleString()}` : "—");
const pct = (v?: number) => {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (v <= 1) return `${Math.round(v * 100)}%`;
  if (v > 100 && v <= 10000) return `${Math.round(v / 100)}%`;
  return `${Math.round(v)}%`;
};

function header(pdf: jsPDF, title: string, reportId: string, section = "Concept AI") {
  fill(pdf, c.navy); pdf.rect(0, 0, page.width, 8, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); txt(pdf, c.navy);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", page.margin, 28);
  pdf.setFont("helvetica", "normal"); txt(pdf, c.muted);
  pdf.text(title || "Untitled", page.width - page.margin, 28, { align: "right" });
  draw(pdf, c.border); pdf.line(page.margin, page.height - 42, page.width - page.margin, page.height - 42);
  pdf.setFontSize(7.5); pdf.text(`Report ${reportId}`, page.margin, page.height - 26);
  pdf.text(`${section} | Page ${pdf.getNumberOfPages()}`, page.width - page.margin, page.height - 26, { align: "right" });
}
function addPage(pdf: jsPDF, title: string, reportId: string, section?: string) { pdf.addPage(); header(pdf, title, reportId, section); return 62; }
function need(pdf: jsPDF, y: number, h: number, title: string, reportId: string, section?: string) { return y + h > page.height - page.bottom ? addPage(pdf, title, reportId, section) : y; }

function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs) {
  fill(pdf, c.navy); pdf.rect(0, 0, page.width, page.height, "F");
  fill(pdf, [0, 22, 70]); pdf.rect(0, page.height - 112, page.width, 112, "F");
  txt(pdf, c.white); pdf.setFont("times", "bold"); pdf.setFontSize(32);
  const titleLines = pdf.splitTextToSize(inputs.projectName || "Feasibility Report", page.width - page.margin * 2) as string[];
  pdf.text(titleLines, page.margin, 184);
  txt(pdf, c.teal); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
  pdf.text([inputs.industry, inputs.location].filter(Boolean).join(" · ") || "Strategic Feasibility Review", page.margin, 190 + titleLines.length * 34);
  txt(pdf, c.white); pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
  pdf.text(`${clean(report.classification, "Confidential")} — Prepared for decision review`, page.margin, 270);
  pdf.setFontSize(9);
  pdf.text(`Report ID: ${clean(report.reportId)}`, page.margin, page.height - 72);
  pdf.text(`Date: ${clean(report.dateIssued)}`, page.margin + 170, page.height - 72);
  pdf.text(`Prepared by: ${clean(report.preparedBy, "Concept AI")}`, page.margin + 310, page.height - 72);
}

function major(pdf: jsPDF, y: number, no: string, action: string, title: string, reportId: string) {
  y = need(pdf, y, 62, title, reportId, no);
  fill(pdf, c.navy); pdf.rect(page.margin, y - 10, page.width - page.margin * 2, 3, "F");
  txt(pdf, c.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  const lines = pdf.splitTextToSize(`${no.toUpperCase()} — ${action}`, page.width - page.margin * 2) as string[];
  pdf.text(lines, page.margin, y + 10);
  draw(pdf, c.border); pdf.line(page.margin, y + 18 + (lines.length - 1) * 12, page.width - page.margin, y + 18 + (lines.length - 1) * 12);
  return y + 36 + (lines.length - 1) * 12;
}
function sub(pdf: jsPDF, y: number, label: string, title: string, reportId: string) {
  y = need(pdf, y, 26, title, reportId);
  txt(pdf, c.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.5); pdf.text(label.toUpperCase(), page.margin, y);
  return y + 14;
}
function para(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const body = clean(text, ""); if (!body) return y;
  pdf.setFont("times", "normal"); pdf.setFontSize(10); txt(pdf, c.text);
  for (const block of body.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)) {
    const lines = pdf.splitTextToSize(block.replace(/\n/g, " "), page.width - page.margin * 2) as string[];
    y = need(pdf, y, lines.length * 12 + 10, title, reportId);
    pdf.text(lines, page.margin, y); y += lines.length * 12 + 8;
  }
  return y;
}
function take(pdf: jsPDF, y: number, text: string, title: string, reportId: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, page.width - page.margin * 2 - 24) as string[];
  y = need(pdf, y, lines.length * 12 + 24, title, reportId);
  fill(pdf, c.teal); pdf.roundedRect(page.margin, y, page.width - page.margin * 2, lines.length * 12 + 16, 4, 4, "F");
  txt(pdf, c.white); pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.text(lines, page.margin + 12, y + 15);
  return y + lines.length * 12 + 24;
}
function list(pdf: jsPDF, y: number, items: string[] | undefined, title: string, reportId: string, numbered = false) {
  if (!items?.length) return y;
  items.forEach((item, i) => {
    const lines = pdf.splitTextToSize(clean(item), page.width - page.margin * 2 - 24) as string[];
    y = need(pdf, y, lines.length * 11 + 8, title, reportId);
    txt(pdf, c.text); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.8);
    pdf.text(numbered ? `${i + 1}.` : "•", page.margin, y); pdf.text(lines, page.margin + 20, y);
    y += lines.length * 11 + 6;
  });
  return y + 4;
}
function tbl(pdf: jsPDF, y: number, title: string, reportId: string, head: string[][], body: Cell[][], opts: { fs?: number; first?: number; hiLast?: boolean } = {}) {
  if (!body.length) return y;
  autoTable(pdf, {
    startY: y, margin: { left: page.margin, right: page.margin }, head, body,
    styles: { font: "helvetica", fontSize: opts.fs ?? 8, cellPadding: { top: 6, bottom: 6, left: 7, right: 7 }, textColor: c.text, lineColor: c.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: c.navy, textColor: c.white, fontStyle: "bold" }, alternateRowStyles: { fillColor: c.stripe },
    columnStyles: opts.first ? { 0: { cellWidth: opts.first, fontStyle: "bold" } } : undefined,
    didParseCell: (d) => { if (opts.hiLast && d.section === "body" && d.row.index === body.length - 1) d.cell.styles.fillColor = c.highlight; },
    didDrawPage: () => header(pdf, title, reportId),
  });
  return lastY(pdf, y) + 16;
}
const fields = (pdf: jsPDF, y: number, title: string, reportId: string, rows: Array<[string, string]>) => tbl(pdf, y, title, reportId, [["Field", "Details"]], rows, { first: 132, fs: 8.1 });

function thesis(report: FeasibilityReport, inputs: ConceptInputs) {
  return report.narrative?.governingThesis || `${inputs.projectName || "The concept"} represents a ${report.scores.verdict.toLowerCase()} opportunity in ${inputs.location || "the target market"}, supported by a ${score(report.scores.overall)} feasibility score, ${clean(report.market.tamValue)} market potential, and a path to ${clean(report.financials.breakEvenSummary)} — provided execution addresses ${clean(inputs.regulatoryConsiderations || inputs.knownRisks, "regulatory and operational risk")} from Day 1.`;
}
const action = (r: FeasibilityReport, key: keyof NonNullable<FeasibilityReport["actionTitles"]>, fallback: string) => r.actionTitles?.[key] || fallback;
const scoringRows = (r: FeasibilityReport): Cell[][] => [["Financial Feasibility", score(r.scores.financial), clean(r.scores.financialFinding)], ["Market Attractiveness", score(r.scores.market), clean(r.scores.marketFinding)], ["Technical Achievability", score(r.scores.achievability), clean(r.scores.achievabilityFinding)], ["Operational Feasibility", score(r.scores.operational), clean(r.scores.operationalFinding)], ["Risk Level (inverse)", score(r.scores.risk), clean(r.scores.riskFinding)], ["Market Timing", score(r.scores.timing), clean(r.scores.timingFinding)], ["Overall Weighted Score", score(r.scores.overall), clean(r.scores.verdict)]];
const methodologyRows = (r: FeasibilityReport): Cell[][] => {
  const w = r.scores.weights, conf = r.scores.confidence, rat = r.scores.rationale; if (!w && !conf && !rat) return [];
  const ds = ["financial", "market", "achievability", "risk", "timing", "operational"] as const;
  return ds.map((d) => [d[0].toUpperCase() + d.slice(1), pct(w?.[d]), pct(conf?.[d]), clean(rat?.[d])]);
};

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const title = inputs.projectName || "Untitled";
  const reportId = report.reportId || "Concept-AI";
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs);
  let y = addPage(pdf, title, reportId, "Governing Thesis");

  y = major(pdf, y, "1. Governing Thesis & Report Scope", action(report, "executiveSummary", "The investment case depends on market timing, financial resilience, and execution discipline"), title, reportId);
  y = para(pdf, y, thesis(report, inputs), title, reportId);
  y = sub(pdf, y, "Three arguments that determine the decision", title, reportId);
  const args = report.narrative?.keyArguments?.length ? report.narrative.keyArguments.map((x) => [x.argument, x.evidence, x.implication]) : [["Market", clean(report.scores.marketFinding), `${clean(report.market.tamValue)} TAM with ${clean(report.market.tamCagr)} growth.`], ["Financial", clean(report.scores.financialFinding), `${clean(report.financials.investmentRange)} investment and ${clean(report.financials.breakEvenSummary)} break-even.`], ["Risk", clean(report.scores.riskFinding), `${report.risks?.length || 0} primary risks identified.`]];
  y = tbl(pdf, y, title, reportId, [["Argument", "Evidence", "Implication"]], args, { first: 90, fs: 7.8 });
  y = tbl(pdf, sub(pdf, y, "FMART Scorecard", title, reportId), title, reportId, [["Dimension", "Score", "Key Finding"]], scoringRows(report), { first: 120, fs: 7.5, hiLast: true });
  const method = methodologyRows(report); if (method.length) y = tbl(pdf, sub(pdf, y, "Scoring Methodology — Weights & Confidence", title, reportId), title, reportId, [["Dimension", "Weight", "Confidence", "Rationale"]], method, { first: 85, fs: 7.3 });
  y = take(pdf, y, `The ${score(report.scores.overall)} score supports a ${clean(report.scores.verdict)} recommendation, but decision quality depends on validating market, financial, and execution assumptions.`, title, reportId);

  y = major(pdf, y, "2. Situation: Market Context & Problem Definition", action(report, "marketAnalysis", "The target market shows demand signals, but buyer urgency must be validated"), title, reportId);
  y = para(pdf, y, report.narrative?.situation || report.executiveSummary, title, reportId);
  y = fields(pdf, y, title, reportId, [["Project", clean(inputs.projectName)], ["Industry", clean(inputs.industry)], ["Location", clean(inputs.location)], ["Business Model", clean(inputs.businessModel)], ["Revenue Model", clean(inputs.revenueModel)], ["Budget Range", clean(inputs.budgetRange)], ["Timeline", clean(inputs.timeline)], ["Team Size", clean(inputs.teamSize)], ["Technology Readiness", clean(inputs.technologyReadiness)]]);
  y = tbl(pdf, sub(pdf, y, "Market Sizing", title, reportId), title, reportId, [["Tier", "Label", "Value", "CAGR"]], [["TAM", clean(report.market.tamLabel), clean(report.market.tamValue), clean(report.market.tamCagr)], ["SAM", clean(report.market.samLabel), clean(report.market.samValue), clean(report.market.samCagr)], ["SOM", clean(report.market.somLabel), clean(report.market.somValue), clean(report.market.somCagr)]], { first: 50, fs: 8 });
  if (report.market.growthChart?.length) y = tbl(pdf, y, title, reportId, [["Year", `TAM (${report.market.currency || "currency"})`, `SAM (${report.market.currency || "currency"})`]], report.market.growthChart.map((r) => [r.year, num(r.tam), num(r.sam)]), { first: 80, fs: 8 });
  y = take(pdf, y, "Market sizing supports the opportunity, but primary buyer interviews and willingness-to-pay validation remain required before scaling investment.", title, reportId);

  y = major(pdf, y, "3. Complication: Why Now, Why This Team, Why This Solution", action(report, "technicalFeasibility", "Execution advantage depends on team capability, integrations, and compliance readiness"), title, reportId);
  y = para(pdf, y, report.narrative?.complication || clean(inputs.description), title, reportId);
  if (report.managementTeam?.members?.length) y = tbl(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Name", "Role", "Credentials", "Project Relevance"]], report.managementTeam.members.map((m) => [m.name, m.role, m.relevantCredentials, m.projectRelevance]), { first: 70, fs: 7.1 });
  else y = fields(pdf, sub(pdf, y, "Management Team Deep-Dive", title, reportId), title, reportId, [["Current Evidence", clean(inputs.founderExperience)], ["Gap", "Named leadership credentials, role ownership, skills gaps, and hiring plan must be validated before investment approval."]]);
  if (report.managementTeam?.skillsGapAnalysis?.length) y = tbl(pdf, y, title, reportId, [["Gap", "Impact", "Hiring Action", "Timing", "Cost"]], report.managementTeam.skillsGapAnalysis.map((g) => [g.gap, g.impact, g.hiringAction, g.targetTiming, g.estimatedCost]), { first: 78, fs: 6.9 });
  if (report.technologyArchitecture) {
    y = para(pdf, sub(pdf, y, "Technology Architecture", title, reportId), report.technologyArchitecture.architectureSummary, title, reportId);
    y = tbl(pdf, y, title, reportId, [["Layer", "Choice", "Rationale"]], report.technologyArchitecture.stackDecisions.map((s) => [s.layer, s.choice, s.rationale]), { first: 80, fs: 7.3 });
    y = fields(pdf, y, title, reportId, [["Data Pipeline", report.technologyArchitecture.dataPipelineDesign], ["Security Architecture", report.technologyArchitecture.securityArchitecture], ["API Governance", report.technologyArchitecture.apiGovernance], ["Scalability Model", report.technologyArchitecture.scalabilityModel]]);
  } else y = fields(pdf, sub(pdf, y, "Technology Architecture", title, reportId), title, reportId, [["Architecture Gap", "System architecture, data pipeline, security architecture, API governance, and scalability model are required before technical sign-off."], ["Dependencies", clean(inputs.dependencies)], ["Regulatory Evidence", clean(inputs.regulatoryConsiderations)]]);
  y = take(pdf, y, "Proceed only if leadership gaps and architecture choices are closed before the build phase starts.", title, reportId);

  y = major(pdf, y, "4. Market Attractiveness & Competitive Positioning", "Competitor pressure is manageable if the solution owns a narrow use case before expanding", title, reportId);
  y = fields(pdf, y, title, reportId, [["Customer Goals", clean(report.customer.goals)], ["Willingness to Pay", clean(report.customer.willingnessToPay)], ["Behavior", clean(report.customer.behavior)], ["Income / Segment", clean(report.customer.income)]]);
  if (report.competitors?.length) y = tbl(pdf, y, title, reportId, [["Competitor", "Model", "Weakness", "Our Edge"]], report.competitors.map((x) => [clean(x.name), clean(x.model), clean(x.weakness), clean(x.edge)]), { first: 72, fs: 7.1 });
  if (report.research) {
    y = para(pdf, sub(pdf, y, "Market Research & Signals", title, reportId), report.research.overview, title, reportId);
    y = fields(pdf, y, title, reportId, [["Confidence", clean(report.research.confidence)], ["Sentiment", clean(report.research.sentiment)]]);
    y = list(pdf, sub(pdf, y, "Key Signals", title, reportId), report.research.keySignals, title, reportId);
    y = list(pdf, sub(pdf, y, "Pain Points", title, reportId), report.research.painPoints, title, reportId);
    y = list(pdf, sub(pdf, y, "Web Signals", title, reportId), report.research.webSignals, title, reportId);
    if (report.research.citations?.length) y = tbl(pdf, sub(pdf, y, "Citations", title, reportId), title, reportId, [["Source", "Title", "Takeaway", "URL"]], report.research.citations.map((x) => [clean(x.source), clean(x.title), clean(x.takeaway), clean(x.url)]), { first: 55, fs: 6.5 });
  }

  y = major(pdf, y, "5. Financial Model & Scenario Analysis", action(report, "financialAnalysis", "Break-even depends on CAC discipline, churn control, and staged capital deployment"), title, reportId);
  y = fields(pdf, y, title, reportId, [["Investment Range", clean(report.financials.investmentRange)], ["Break-Even", clean(report.financials.breakEvenSummary)], ["LTV : CAC", clean(report.financials.ltvCacRatio)], ["CapEx Low", money(report.financials.currency, report.financials.capExTotal.low)], ["CapEx Mid", money(report.financials.currency, report.financials.capExTotal.mid)], ["CapEx High", money(report.financials.currency, report.financials.capExTotal.high)]]);
  if (report.financials.capEx?.length) y = tbl(pdf, sub(pdf, y, "Capital Expenditure", title, reportId), title, reportId, [["Category", "Low", "High", "Notes"]], report.financials.capEx.map((x) => [clean(x.category), num(x.low), num(x.high), clean(x.notes)]), { first: 130, fs: 7.2 });
  if (report.financials.opEx?.length) y = tbl(pdf, sub(pdf, y, "Operating Expenses", title, reportId), title, reportId, [["Category", "Monthly", "Annual"]], report.financials.opEx.map((x) => [clean(x.category), num(x.monthly), num(x.annual)]), { first: 210, fs: 7.8 });
  if (report.financials.scenarios?.length) y = tbl(pdf, sub(pdf, y, "Revenue Scenarios", title, reportId), title, reportId, [["Scenario", "Probability", "Yr 1 Subscribers", "Annual Revenue", "Break-Even"]], report.financials.scenarios.map((x) => [clean(x.scenario), clean(x.probability), clean(x.subscribersYr1), clean(x.annualRevenue), clean(x.breakEven)]), { first: 80, fs: 7.2 });
  if (report.financialStressTesting) {
    y = fields(pdf, sub(pdf, y, "Unit Economics", title, reportId), title, reportId, [["ARPU", report.financialStressTesting.unitEconomics.arpu], ["Churn Rate", report.financialStressTesting.unitEconomics.churnRate], ["Gross Margin", report.financialStressTesting.unitEconomics.grossMargin], ["Payback Period", report.financialStressTesting.unitEconomics.paybackPeriod], ["CAC", report.financialStressTesting.unitEconomics.cac]]);
    y = tbl(pdf, sub(pdf, y, "Sensitivity Analysis", title, reportId), title, reportId, [["Variable", "Base", "Downside", "Break-Even Impact", "Mitigation"]], report.financialStressTesting.sensitivity.map((x) => [x.variable, x.baseCase, x.downsideCase, x.impactOnBreakEven, x.mitigation]), { first: 75, fs: 6.8 });
    y = tbl(pdf, sub(pdf, y, "Valuation Metrics", title, reportId), title, reportId, [["Scenario", "NPV", "IRR", "Payback"]], report.financialStressTesting.valuationMetrics.map((x) => [x.scenario, x.npv, x.irr, x.payback]), { first: 85, fs: 7.8 });
  } else y = take(pdf, y, "Financial model limitations: add 24-month cash flow, CAC/churn sensitivity, ARPU, payback period, NPV, and IRR before investment approval.", title, reportId);

  y = major(pdf, y, "6. Risk Register with Quantified Expected Values", action(report, "riskAssessment", "The risk profile is acceptable only if quantified exposure is owned and mitigated before scale-up"), title, reportId);
  y = tbl(pdf, y, title, reportId, [["Risk", "Probability", "Impact", "Level", "Mitigation"]], report.risks.map((x) => [clean(x.name), clean(x.probability), clean(x.impact), clean(x.level), clean(x.mitigation)]), { first: 112, fs: 7.1 });
  if (report.quantifiedRisks?.length) y = tbl(pdf, y, title, reportId, [["Risk", "Probability", "Financial Impact", "Expected Value", "Owner", "Mitigation"]], report.quantifiedRisks.map((x) => [x.risk, `${x.probabilityPercent}%`, x.financialImpact, x.expectedValue, x.owner, x.mitigation]), { first: 80, fs: 6.7 });
  else y = take(pdf, y, "Risk register should quantify probability × financial impact for each material risk before capital allocation.", title, reportId);

  y = major(pdf, y, "7. Funding Structure & Investor Returns", action(report, "fundingInvestorReturns", "Funding should stage capital against de-risking milestones and a credible exit path"), title, reportId);
  if (report.fundingMix?.length) y = tbl(pdf, y, title, reportId, [["Source", "Share", "Amount", "Rationale"]], report.fundingMix.map((x) => [clean(x.source), clean(x.share), clean(x.amount), clean(x.rationale)]), { first: 125, fs: 7.3 });
  y = para(pdf, y, report.fundingAdvisory, title, reportId);
  if (report.investorReturns) {
    y = fields(pdf, y, title, reportId, [["Target IRR", report.investorReturns.targetIrr]]);
    y = tbl(pdf, sub(pdf, y, "Exit Scenarios", title, reportId), title, reportId, [["Route", "Likely Acquirers", "Valuation Logic", "Timing"]], report.investorReturns.exitScenarios.map((x) => [x.route, x.likelyAcquirers, x.valuationLogic, x.timing]), { first: 80, fs: 7 });
    y = tbl(pdf, sub(pdf, y, "Five-Year Valuation", title, reportId), title, reportId, [["Year", "Revenue", "Multiple", "Implied Valuation"]], report.investorReturns.fiveYearValuation.map((x) => [x.year, x.revenue, x.multiple, x.impliedValuation]), { first: 55, fs: 7.8 });
  }

  y = major(pdf, y, "8. Go-to-Market Strategy", action(report, "goToMarket", "Commercial execution must prioritize the segments with fastest trust and lowest acquisition friction"), title, reportId);
  if (report.goToMarket) {
    y = tbl(pdf, y, title, reportId, [["Channel", "Role", "Rationale", "Year 1 Target"]], report.goToMarket.channelStrategy.map((x) => [x.channel, x.role, x.rationale, x.year1Target]), { first: 80, fs: 7 });
    y = tbl(pdf, sub(pdf, y, "Pricing Ladder", title, reportId), title, reportId, [["Tier", "Target Customer", "Price Point", "Feature Gate"]], report.goToMarket.pricingLadder.map((x) => [x.tier, x.targetCustomer, x.pricePoint, x.featureGate]), { first: 80, fs: 7 });
    y = tbl(pdf, sub(pdf, y, "Acquisition Playbook", title, reportId), title, reportId, [["Segment", "Why First", "Message", "Sales Cycle", "CAC"]], report.goToMarket.acquisitionPlaybook.map((x) => [x.segment, x.whyFirst, x.message, x.expectedSalesCycle, x.cacEstimate]), { first: 75, fs: 6.7 });
    y = tbl(pdf, sub(pdf, y, "Year 1 Pipeline Targets", title, reportId), title, reportId, [["Segment", "Leads", "Opportunities", "Expected Customers"]], report.goToMarket.pipelineTargets.map((x) => [x.segment, x.leads, x.opportunities, x.expectedCustomers]), { first: 95, fs: 7.7 });
  } else y = take(pdf, y, "GTM gap: define channels, pricing tiers, first verticals, CAC by channel, sales cycle, and Year 1 pipeline targets before launch.", title, reportId);

  y = major(pdf, y, "9. Implementation Roadmap", action(report, "implementationRoadmap", "A phase-gate roadmap should tie spend release to compliance, product-market fit, and sales traction"), title, reportId);
  if (report.implementationRoadmap?.phases?.length) y = tbl(pdf, y, title, reportId, [["Phase", "Timeline", "Activities", "Decision Gate", "Success Metric"]], report.implementationRoadmap.phases.map((x) => [x.phase, x.timeline, x.keyActivities, x.decisionGate, x.successMetric]), { first: 65, fs: 6.8 });
  else y = tbl(pdf, y, title, reportId, [["Phase", "Timeline", "Decision Gate"]], [["0. Validation", "0–8 weeks", "Primary interviews, pricing proof, compliance requirements"], ["1. MVP", "2–6 months", "Working product, priority integrations, security baseline"], ["2. Pilot", "6–12 months", "Paid pilots and retention signal"], ["3. Scale", "12–24 months", "Repeatable CAC and operating model"]], { first: 80, fs: 8 });

  y = major(pdf, y, "10. Strategic Recommendations", action(report, "recommendations", "Five execution choices will determine whether the opportunity scales or stalls at adoption"), title, reportId);
  y = list(pdf, y, report.recommendations, title, reportId, true);
  y = sub(pdf, y, "Next Steps", title, reportId); y = list(pdf, y, report.nextSteps, title, reportId, true);

  y = major(pdf, y, "11. Appendix: Limitations, Assumptions & Primary Research", "The report is decision-useful but requires primary validation before final investment approval", title, reportId);
  y = fields(pdf, y, title, reportId, [["Assumptions", clean(inputs.assumptions)], ["Constraints", clean(inputs.constraints)], ["Success Factors", clean(inputs.successFactors)], ["Known Risks", clean(inputs.knownRisks)], ["Regulatory Considerations", clean(inputs.regulatoryConsiderations)], ["Dependencies", clean(inputs.dependencies)]]);
  if (report.narrative?.limitations?.length) y = list(pdf, sub(pdf, y, "Limitations", title, reportId), report.narrative.limitations, title, reportId);
  if (report.primaryResearch) {
    y = fields(pdf, sub(pdf, y, "Primary Research Plan", title, reportId), title, reportId, [["Interview Targets", report.primaryResearch.interviewTargets], ["Current Evidence Gap", report.primaryResearch.currentEvidenceGap]]);
    y = list(pdf, sub(pdf, y, "Validation Needed", title, reportId), report.primaryResearch.validationNeeded, title, reportId);
  } else y = take(pdf, y, "Primary research gap: conduct 10–15 customer interviews, willingness-to-pay survey, and problem-severity scoring before moving from feasibility to investment decision.", title, reportId);

  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
