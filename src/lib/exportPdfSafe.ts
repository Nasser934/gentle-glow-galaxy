import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport, ResearchCitation } from "@/types/analysis";
import { sourceQuality, validateTemplateIntegrity } from "@/lib/reportTemplates";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type JsPdfAuto = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (placeholder: string) => void };

const TOTAL = "{total_pages_count_string}";
const W = 595.28;
const H = 841.89;
const M = 42;
const BOTTOM = 64;
const NAVY: [number, number, number] = [11, 31, 58];
const MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [209, 213, 219];
const STRIPE: [number, number, number] = [243, 244, 246];

const clean = (v: unknown, fallback = "—") => String(v ?? fallback).replace(/\s+/g, " ").trim() || fallback;
const score = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)} / 10` : "—";

function header(pdf: jsPDF, title: string, section: string) {
  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text("CONCEPT AI · FEASIBILITY STUDY", M, 28);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTED);
  pdf.text(clean(title), W - M, 28, { align: "right" });
  pdf.setDrawColor(...BORDER);
  pdf.line(M, H - 42, W - M, H - 42);
  pdf.setFontSize(7.2);
  pdf.text(`${section} | Confidential | Page ${pdf.getNumberOfPages()} of ${TOTAL}`, M, H - 26);
}

function page(pdf: jsPDF, title: string, section: string) {
  pdf.addPage();
  header(pdf, title, section);
  return 62;
}

function ensure(pdf: jsPDF, y: number, need: number, title: string, section: string) {
  return y + need > H - BOTTOM ? page(pdf, title, section) : y;
}

function heading(pdf: jsPDF, y: number, title: string, actionTitle: string, reportTitle: string) {
  y = ensure(pdf, y, 60, reportTitle, title);
  pdf.setTextColor(...NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  const lines = pdf.splitTextToSize(`${title.toUpperCase()} — ${actionTitle}`, W - M * 2) as string[];
  pdf.text(lines, M, y);
  pdf.setDrawColor(...BORDER);
  pdf.line(M, y + lines.length * 13 + 5, W - M, y + lines.length * 13 + 5);
  return y + lines.length * 13 + 24;
}

function paragraph(pdf: jsPDF, y: number, body: string, title: string, section: string) {
  const lines = pdf.splitTextToSize(clean(body), W - M * 2) as string[];
  y = ensure(pdf, y, lines.length * 11 + 12, title, section);
  pdf.setTextColor(17, 24, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(lines, M, y);
  return y + lines.length * 11 + 10;
}

function drawTable(pdf: jsPDF, y: number, title: string, section: string, head: string[], rows: (string | number)[][]) {
  if (!rows.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: M, right: M },
    head: [head],
    body: rows.map((r) => r.map((c) => clean(c))),
    styles: { font: "helvetica", fontSize: 7, cellPadding: 4, overflow: "linebreak", valign: "top", lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: STRIPE },
    didDrawPage: () => header(pdf, title, section),
  });
  return ((pdf as JsPdfAuto).lastAutoTable?.finalY ?? y) + 16;
}

function bulletList(pdf: jsPDF, y: number, title: string, section: string, items: string[]) {
  items.slice(0, 10).forEach((item) => {
    const lines = pdf.splitTextToSize(clean(item), W - M * 2 - 14) as string[];
    y = ensure(pdf, y, lines.length * 11 + 8, title, section);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.7);
    pdf.setTextColor(17, 24, 39);
    pdf.text("•", M, y);
    pdf.text(lines, M + 14, y);
    y += lines.length * 11 + 6;
  });
  return y + 4;
}

function fallbackCompetitors(label: string) {
  if (/customer data/i.test(label)) return [
    ["Twilio Segment", "CDP and event collection", "Implementation complexity", "Faster customer 360 activation"],
    ["Salesforce Data Cloud", "CRM ecosystem", "Salesforce lock-in", "Vendor-neutral profile layer"],
    ["Adobe Real-Time CDP", "Enterprise marketing depth", "High cost", "Lean pilot and activation focus"],
    ["Tealium", "Data governance", "Technical setup burden", "Simpler integration package"],
  ];
  if (/data insights|BI/i.test(label)) return [
    ["Microsoft Power BI", "Microsoft ecosystem", "Governance setup burden", "Faster time-to-insight"],
    ["Tableau", "Visualization strength", "Dashboard fatigue risk", "Insight-to-action workflow"],
    ["Looker", "Semantic modeling", "Technical setup", "Business KPI catalog"],
    ["Qlik", "Associative analytics", "Complexity", "Simpler governed metrics"],
  ];
  if (/fintech|financial/i.test(label)) return [
    ["Fiserv", "Financial services footprint", "Enterprise implementation", "Faster secure deployment"],
    ["FIS", "Banking infrastructure", "Legacy complexity", "Modern client-data layer"],
    ["nCino", "Financial workflows", "Narrower data-security focus", "Security-first client data management"],
    ["Mambu", "Cloud banking", "Platform dependency", "Data governance and controls"],
  ];
  if (/enterprise software/i.test(label)) return [
    ["Salesforce", "Enterprise distribution", "Cost and customization", "Focused workflow and implementation"],
    ["ServiceNow", "Workflow platform", "Long implementation", "Faster department-led rollout"],
    ["Oracle", "Enterprise stack", "Complex deployment", "Modular integration"],
    ["SAP", "ERP footprint", "Change-management burden", "Targeted operating workflow"],
  ];
  return [
    ["Microsoft Teams", "Distribution", "Workflow depth", "Focused workflow layer"],
    ["Slack", "Messaging ecosystem", "Reporting depth", "Decision workflow"],
    ["Notion", "Flexible workspace", "Enterprise controls", "Governed workspace"],
    ["Asana / Monday", "Project workflows", "Knowledge layer", "Integrated workflow and reporting"],
  ];
}

function fallbackSources(label: string): ResearchCitation[] {
  if (/customer data/i.test(label)) return [
    { source: "Twilio Segment", title: "Segment official product page", url: "https://segment.com/", takeaway: "Reference competitor and CDP category positioning." },
    { source: "Salesforce", title: "Salesforce Data Cloud", url: "https://www.salesforce.com/data/", takeaway: "Reference CRM-native customer data platform competitor." },
    { source: "Adobe", title: "Adobe Real-Time CDP", url: "https://business.adobe.com/products/real-time-customer-data-platform/adobe-real-time-cdp.html", takeaway: "Reference enterprise CDP competitor." },
  ];
  if (/data insights|BI/i.test(label)) return [
    { source: "Microsoft", title: "Power BI official product page", url: "https://powerbi.microsoft.com/", takeaway: "Reference BI incumbent and ecosystem position." },
    { source: "Salesforce Tableau", title: "Tableau official product page", url: "https://www.tableau.com/", takeaway: "Reference enterprise analytics competitor." },
    { source: "Google Cloud", title: "Looker official product page", url: "https://cloud.google.com/looker", takeaway: "Reference semantic layer competitor." },
  ];
  if (/fintech|financial/i.test(label)) return [
    { source: "PCI Security Standards Council", title: "PCI DSS standard", url: "https://www.pcisecuritystandards.org/", takeaway: "Reference payment and client-data security controls." },
    { source: "AICPA", title: "SOC 2 overview", url: "https://www.aicpa-cima.com/", takeaway: "Reference enterprise security trust controls." },
    { source: "IBM", title: "Cost of a Data Breach Report", url: "https://www.ibm.com/reports/data-breach", takeaway: "Reference cyber-risk and data-breach relevance." },
  ];
  return [
    { source: "Gartner", title: "Enterprise software category research", url: "https://www.gartner.com/", takeaway: "Reference enterprise buying and software category context." },
    { source: "Salesforce", title: "Salesforce official product page", url: "https://www.salesforce.com/", takeaway: "Reference enterprise software incumbent." },
    { source: "ServiceNow", title: "ServiceNow official product page", url: "https://www.servicenow.com/", takeaway: "Reference workflow platform incumbent." },
  ];
}

function citationRows(report: FeasibilityReport, label: string) {
  const citations = report.research?.citations?.length ? report.research.citations : fallbackSources(label);
  return citations.slice(0, 12).map((c) => [sourceQuality(c.source, c.title), c.source, c.title, c.takeaway || "Supports report context."]);
}

export async function exportReportToPdfSafe(_root: HTMLElement, fileName: string, payload: Payload): Promise<{ fileName: string }> {
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  const label = validation.template.label;
  const title = clean(inputs.projectName, "Feasibility Study");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });

  pdf.setFillColor(...NAVY);
  pdf.rect(0, 0, W, H, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(pdf.splitTextToSize(title, W - M * 2), M, 145);
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${clean(inputs.industry)} · ${clean(inputs.location)}`, M, 230);
  pdf.text(`Report ${clean(report.reportId)} · ${label}`, M, 710);
  pdf.text("Confidential · Concept AI", M, 732);

  let y = page(pdf, title, "Executive Decision Summary");
  y = heading(pdf, y, "Executive Decision Summary", "Export always produces a readable feasibility study", title);
  y = paragraph(pdf, y, report.executiveSummary, title, "Executive Decision Summary");
  y = drawTable(pdf, y, title, "Executive Decision Summary", ["Metric", "Value"], [
    ["Recommendation", validation.recommendation],
    ["Overall score", score(report.scores.overall)],
    ["Template", label],
    ["Investment", report.financials.investmentRange || clean(report.financials.capExTotal?.mid)],
    ["TAM", report.market.tamValue],
    ["Break-even", report.financials.breakEvenSummary],
  ]);

  if (validation.issues.length) {
    y = page(pdf, title, "QA Warnings");
    y = heading(pdf, y, "QA Warnings", "Quality gaps are shown in the PDF instead of blocking export", title);
    y = drawTable(pdf, y, title, "QA Warnings", ["Severity", "Field", "Issue"], validation.issues.map((i) => [i.severity, i.field, i.message]));
  }

  y = page(pdf, title, "FMART Scorecard");
  y = heading(pdf, y, "FMART Scorecard", "Scores need evidence and validation gates", title);
  y = drawTable(pdf, y, title, "FMART Scorecard", ["Dimension", "Score", "Finding"], [
    ["Financial", score(report.scores.financial), report.scores.financialFinding],
    ["Market", score(report.scores.market), report.scores.marketFinding],
    ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding],
    ["Risk", score(report.scores.risk), report.scores.riskFinding],
    ["Timing", score(report.scores.timing), report.scores.timingFinding],
    ["Operational", score(report.scores.operational), report.scores.operationalFinding],
  ]);

  y = page(pdf, title, "Market and Customer");
  y = heading(pdf, y, "Market and Customer", "Market size supports focus, but pilots prove demand", title);
  y = drawTable(pdf, y, title, "Market and Customer", ["Layer", "Value", "CAGR", "Label"], [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel]]);
  y = drawTable(pdf, y, title, "Market and Customer", ["Customer field", "Value"], [["Target", report.customer.ageLocation], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Behavior", report.customer.behavior]]);

  y = page(pdf, title, "Competitive Positioning");
  y = heading(pdf, y, "Competitive Positioning", "Use fallback competitors when live research is incomplete", title);
  const competitors = report.competitors?.length ? report.competitors.map((c) => [c.name, c.model, c.weakness, c.edge]) : fallbackCompetitors(label);
  y = drawTable(pdf, y, title, "Competitive Positioning", ["Competitor", "Strength / model", "Weakness", "Our wedge"], competitors);

  y = page(pdf, title, "Financial Model");
  y = heading(pdf, y, "Financial Model", "Unit economics need validation before scale funding", title);
  y = drawTable(pdf, y, title, "Financial Model", ["Scenario", "Probability", "Customers", "Revenue", "Break-even"], (report.financials.scenarios || []).map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]));
  y = drawTable(pdf, y, title, "Financial Model", ["Cost area", "Low", "High", "Notes"], (report.financials.capEx || []).map((c) => [c.category, c.low, c.high, c.notes]));

  y = page(pdf, title, "Risk Register");
  y = heading(pdf, y, "Risk Register", "Risks need owners, controls and gate impact", title);
  y = drawTable(pdf, y, title, "Risk Register", ["Risk", "Probability", "Impact", "Level", "Mitigation"], (report.risks || []).map((r) => [r.name, r.probability, r.impact, r.level, r.mitigation]));

  y = page(pdf, title, "Recommendations and Roadmap");
  y = heading(pdf, y, "Recommendations", "Actions should guide the next decision", title);
  y = bulletList(pdf, y, title, "Recommendations and Roadmap", report.recommendations || []);
  y = heading(pdf, y, "Next Steps", "Use phase gates before scaling spend", title);
  y = bulletList(pdf, y, title, "Recommendations and Roadmap", report.nextSteps || []);
  if (report.implementationRoadmap?.phases?.length) {
    y = drawTable(pdf, y, title, "Recommendations and Roadmap", ["Phase", "Timeline", "Activities", "Gate", "Metric"], report.implementationRoadmap.phases.map((p) => [p.phase, p.timeline, p.keyActivities, p.decisionGate, p.successMetric]));
  }

  y = page(pdf, title, "Source Notes");
  y = heading(pdf, y, "Source Notes", "Sources are included or flagged for validation", title);
  y = drawTable(pdf, y, title, "Source Notes", ["Quality", "Source", "Title", "Supported claim"], citationRows(report, label));
  y = paragraph(pdf, y, "If live research returns limited evidence, Concept AI exports fallback source notes and QA warnings rather than blocking the user. The next quality step is to refresh sources with primary, expert, and market references before investment approval.", title, "Source Notes");

  if ((pdf as JsPdfAuto).putTotalPages) (pdf as JsPdfAuto).putTotalPages?.(TOTAL);
  pdf.save(fileName);
  return { fileName };
}
