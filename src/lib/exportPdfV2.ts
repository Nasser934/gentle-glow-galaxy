import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { getRecommendation, getReportTemplate, sanitizeForTemplate } from "@/lib/reportTemplates";

type PdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (placeholder: string) => void };
type PdfExportPayload = { report: FeasibilityReport; inputs: ConceptInputs };
type Cell = string | number;
type Rgb = [number, number, number];

type SectionKey =
  | "Cover"
  | "Executive Decision"
  | "Concept"
  | "Market"
  | "Customer"
  | "Product"
  | "Competition"
  | "FMART"
  | "Financial"
  | "Risk"
  | "Compliance"
  | "GTM"
  | "Roadmap"
  | "Recommendations"
  | "Appendix";

const TOTAL_PAGES = "{total_pages_count_string}";
const PAGE = { width: 595.28, height: 841.89, margin: 46, bottom: 64 };
const COLOR = {
  navy: [11, 31, 58] as Rgb,
  blue: [37, 99, 235] as Rgb,
  teal: [15, 118, 110] as Rgb,
  amber: [217, 119, 6] as Rgb,
  red: [185, 28, 28] as Rgb,
  green: [15, 118, 110] as Rgb,
  text: [17, 24, 39] as Rgb,
  muted: [107, 114, 128] as Rgb,
  border: [209, 213, 219] as Rgb,
  stripe: [243, 244, 246] as Rgb,
  highlight: [245, 250, 255] as Rgb,
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
    .replace(/Massive|massive|explosive/gi, "strong")
    .replace(/Perfect/g, "Strong")
    .trim();
}
function score(value: number) { return Number.isFinite(value) ? `${value.toFixed(1)}/10` : "—"; }
function pct(value: number) { return Number.isFinite(value) ? `${Math.round(value)}%` : "—"; }
function num(value: number) { return Number.isFinite(value) ? Math.round(value).toLocaleString() : "—"; }
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
function acv(report: FeasibilityReport) {
  const source = `${report.financials.breakEvenSummary} ${report.financials.scenarios?.map((s) => `${s.subscribersYr1} ${s.annualRevenue}`).join(" ")}`;
  const match = source.match(/\$?(\d+(?:\.\d+)?)\s*k\s*ACV/i);
  return match ? Number(match[1]) * 1000 : 100_000;
}
function sectionHeader(pdf: jsPDF, title: string, reportId: string, section: SectionKey) {
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
function addPage(pdf: jsPDF, title: string, reportId: string, section: SectionKey) {
  pdf.addPage();
  sectionHeader(pdf, title, reportId, section);
  return 62;
}
function ensureSpace(pdf: jsPDF, y: number, height: number, title: string, reportId: string, section: SectionKey) {
  return y + height > PAGE.height - PAGE.bottom ? addPage(pdf, title, reportId, section) : y;
}
function major(pdf: jsPDF, y: number, label: string, action: string, title: string, reportId: string, section: SectionKey) {
  y = ensureSpace(pdf, y, 66, title, reportId, section);
  setFill(pdf, COLOR.navy);
  pdf.rect(PAGE.margin, y - 10, PAGE.width - PAGE.margin * 2, 3, "F");
  setText(pdf, COLOR.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  const lines = pdf.splitTextToSize(`${label.toUpperCase()} — ${action}`, PAGE.width - PAGE.margin * 2) as string[];
  pdf.text(lines, PAGE.margin, y + 10);
  setDraw(pdf, COLOR.border);
  pdf.line(PAGE.margin, y + 20 + (lines.length - 1) * 13, PAGE.width - PAGE.margin, y + 20 + (lines.length - 1) * 13);
  return y + 40 + (lines.length - 1) * 13;
}
function sub(pdf: jsPDF, y: number, label: string, title: string, reportId: string, section: SectionKey) {
  y = ensureSpace(pdf, y, 24, title, reportId, section);
  setText(pdf, COLOR.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.text(label.toUpperCase(), PAGE.margin, y);
  return y + 14;
}
function para(pdf: jsPDF, y: number, text: string, title: string, reportId: string, section: SectionKey) {
  const body = clean(text, "");
  if (!body) return y;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.8);
  setText(pdf, COLOR.text);
  const lines = pdf.splitTextToSize(body, PAGE.width - PAGE.margin * 2) as string[];
  y = ensureSpace(pdf, y, lines.length * 12 + 10, title, reportId, section);
  pdf.text(lines, PAGE.margin, y);
  return y + lines.length * 12 + 8;
}
function brief(pdf: jsPDF, y: number, text: string, title: string, reportId: string, section: SectionKey) {
  const lines = pdf.splitTextToSize(clean(text), PAGE.width - PAGE.margin * 2 - 20) as string[];
  y = ensureSpace(pdf, y, lines.length * 11 + 24, title, reportId, section);
  setFill(pdf, COLOR.highlight);
  setDraw(pdf, COLOR.border);
  pdf.roundedRect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, lines.length * 11 + 16, 4, 4, "FD");
  setText(pdf, COLOR.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text(lines, PAGE.margin + 10, y + 15);
  return y + lines.length * 11 + 24;
}
function soWhat(pdf: jsPDF, y: number, text: string, title: string, reportId: string, section: SectionKey) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, PAGE.width - PAGE.margin * 2 - 28) as string[];
  y = ensureSpace(pdf, y, lines.length * 12 + 30, title, reportId, section);
  setFill(pdf, COLOR.teal);
  pdf.roundedRect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, lines.length * 12 + 18, 4, 4, "F");
  setText(pdf, COLOR.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.9);
  pdf.text(lines, PAGE.margin + 12, y + 15);
  return y + lines.length * 12 + 30;
}
function table(pdf: jsPDF, y: number, title: string, reportId: string, section: SectionKey, head: string[][], body: Cell[][], opts: { fontSize?: number; firstWidth?: number; scoreWidth?: number; highlightLast?: boolean } = {}) {
  if (!body.length) return y;
  const columnStyles: { [key: string]: { cellWidth?: number; fontStyle?: "bold" | "normal" | "italic" | "bolditalic"; halign?: "left" | "center" | "right" } } = {};
  if (opts.firstWidth) columnStyles[0] = { cellWidth: opts.firstWidth, fontStyle: "bold" };
  if (opts.scoreWidth) columnStyles[1] = { cellWidth: opts.scoreWidth, halign: "center" };
  autoTable(pdf, {
    startY: y,
    margin: { left: PAGE.margin, right: PAGE.margin },
    head,
    body,
    styles: { font: "helvetica", fontSize: opts.fontSize ?? 7.2, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, textColor: COLOR.text, lineColor: COLOR.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: COLOR.navy, textColor: COLOR.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: COLOR.stripe },
    columnStyles,
    didParseCell: (data) => { if (opts.highlightLast && data.section === "body" && data.row.index === body.length - 1) data.cell.styles.fillColor = COLOR.highlight; },
    didDrawPage: () => sectionHeader(pdf, title, reportId, section),
  });
  return lastTableY(pdf, y) + 16;
}
function bullets(pdf: jsPDF, y: number, items: string[], title: string, reportId: string, section: SectionKey) {
  for (const item of items) {
    const lines = pdf.splitTextToSize(clean(item), PAGE.width - PAGE.margin * 2 - 20) as string[];
    y = ensureSpace(pdf, y, lines.length * 11 + 8, title, reportId, section);
    setText(pdf, COLOR.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    pdf.text("•", PAGE.margin, y);
    pdf.text(lines, PAGE.margin + 18, y);
    y += lines.length * 11 + 5;
  }
  return y + 4;
}

function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs, model: string, recommendation: string) {
  setFill(pdf, COLOR.navy);
  pdf.rect(0, 0, PAGE.width, PAGE.height, "F");
  setFill(pdf, [5, 22, 42]);
  pdf.rect(0, PAGE.height - 118, PAGE.width, 118, "F");
  setText(pdf, COLOR.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(30);
  const lines = pdf.splitTextToSize(inputs.projectName || "Feasibility Report", PAGE.width - PAGE.margin * 2) as string[];
  pdf.text(lines, PAGE.margin, 170);
  setText(pdf, [190, 230, 230]);
  pdf.setFontSize(14);
  pdf.text(`${inputs.industry || "Strategic Feasibility"} · ${inputs.location || "Target market"}`, PAGE.margin, 190 + lines.length * 34);
  setText(pdf, COLOR.white);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.text(`Confidential | ${model} | Recommendation: ${recommendation}`, PAGE.margin, 270);
  const thesis = "Investment thesis: Proceed only through a gated validation model. The opportunity is attractive, but scale funding depends on paid pilots, integration validation, reimbursement proof and user adoption.";
  const thesisLines = pdf.splitTextToSize(thesis, PAGE.width - PAGE.margin * 2) as string[];
  pdf.text(thesisLines, PAGE.margin, 320);
  pdf.setFontSize(9);
  pdf.text(`Report ID: ${clean(report.reportId)} | Date: ${clean(report.dateIssued)} | Prepared by: ${clean(report.preparedBy, "Concept AI")}`, PAGE.margin, PAGE.height - 72);
}

function fmartRows(report: FeasibilityReport): Cell[][] {
  return [
    ["Financial", score(report.scores.financial), "20%", "80%", "ACV, CAC, gross margin, implementation cost, reimbursement value", "Validate pricing through paid pilots"],
    ["Market", score(report.scores.market), "20%", "85%", clean(report.scores.marketFinding), "Strong market rationale, but not proof of feasibility"],
    ["Achievability", score(report.scores.achievability), "15%", "80%", "Tech readiness, EHR/device integration complexity", "Start with limited integrations"],
    ["Risk", score(report.scores.risk), "20%", "70%", "HIPAA, FDA/SaMD, cybersecurity, adoption", "Use gated funding"],
    ["Timing", score(report.scores.timing), "15%", "85%", clean(report.scores.timingFinding), "Good entry window"],
    ["Operational", score(report.scores.operational), "10%", "75%", "Clinical workflow, support model, implementation team", "Build clinical success function"],
    ["Overall", score(report.scores.overall), "100%", "—", clean(report.scores.verdict), "Conditional Proceed unless validation gates pass"],
  ];
}
function marketRows(report: FeasibilityReport): Cell[][] {
  const tam = parseAmount(report.market.tamValue, 16_100_000_000) / 1_000_000_000;
  const sam = Math.min(parseAmount(report.market.samValue, 5_900_000_000) / 1_000_000_000, tam * 0.7);
  const tamCagr = parseCagr(report.market.tamCagr, 0.11);
  const samCagr = parseCagr(report.market.samCagr, tamCagr);
  return Array.from({ length: 5 }, (_, i) => [2026 + i, (tam * Math.pow(1 + tamCagr, i)).toFixed(1), (sam * Math.pow(1 + samCagr, i)).toFixed(1), i === 0 ? "Base year" : "Forecast"]);
}
function healthcareCompetitors(projectName: string): Cell[][] {
  return [
    ["Medtronic", "Hardware ecosystem and hospital relationships", "High cost and device lock-in", "Vendor-neutral RPM for post-discharge workflows", "Prove integrations and cost advantage"],
    ["Philips", "Hospital presence and clinical trust", "Enterprise complexity and slower UX updates", "Faster deployment for mid-market providers", "Prove onboarding speed"],
    ["Dexcom / Abbott", "Strong chronic disease device data", "Narrow disease focus", "Broader multi-condition monitoring", "Prove clinical use cases"],
    ["Vivify / Optum", "Mature RPM solution", "Ownership may reduce flexibility", "Configurable workflow for independent providers", "Prove customization speed"],
    ["Epic / EHR-native tools", "Embedded clinical workflow", "Limited cross-device flexibility", `${projectName} as lightweight RPM layer integrated into EHR`, "Prove EHR compatibility"],
  ];
}
function healthcareRisks(report: FeasibilityReport): Cell[][] {
  const base = report.financials.capExTotal?.mid || 3_000_000;
  const risks = [
    ["HIPAA breach", "Med", "High", base * 0.18, "CISO", "security incident or failed pentest", "encryption, RBAC, audit logs, SOC2 roadmap", "stop"],
    ["FDA/SaMD classification issue", "Med", "High", base * 0.16, "Compliance Lead", "clinical decision logic expands beyond monitoring", "regulatory assessment before MVP", "hold"],
    ["EHR integration delay", "High", "High", base * 0.22, "EHR Integration Lead", "FHIR/HL7 path not confirmed", "start with 1-2 EHR paths", "hold"],
    ["Device data reliability issue", "Med", "Med", base * 0.1, "CTO", "missing or inconsistent readings", "device QA and validation rules", "hold"],
    ["Patient adherence below target", "Med", "Med", base * 0.09, "Customer Success Lead", "<60% patients submit readings", "onboarding, reminders, simplified UX", "hold"],
    ["Clinician workflow rejection", "Med", "High", base * 0.14, "Clinical Advisor", "nurses ignore alerts", "co-design workflow before MVP", "stop"],
    ["Alert fatigue", "Med", "Med", base * 0.08, "Clinical Lead", "too many low-value alerts", "risk rules and prioritization", "hold"],
    ["Reimbursement capture failure", "Med", "High", base * 0.15, "Revenue Cycle Advisor", "billing documentation rejected", "validate with billing team", "hold"],
  ];
  return risks.map(([risk, probability, impact, ev, owner, signal, mitigation, gate]) => [risk as string, probability as string, impact as string, money(report.financials.currency, ev as number), owner as string, signal as string, mitigation as string, gate as string]);
}
function healthcareGtmRows(): Cell[][] {
  return [
    ["Health system pilots", "Primary entry motion", "3 paid pilots", "Proves clinical workflow and reimbursement value"],
    ["Specialty clinics", "Focused early adoption", "5 design partners", "Faster decision cycle"],
    ["Payer/provider partnerships", "Value-based care entry", "2 partnerships", "Proves cost-reduction logic"],
    ["EHR marketplace", "Integration-led distribution", "1-2 listings", "Reduces adoption friction"],
    ["Device OEM partnerships", "Data source expansion", "3 devices", "Improves monitoring coverage"],
  ];
}
function healthcareOperatingModel(): Cell[][] {
  return [
    ["Product Lead", "Owns product scope and workflow", "Day 1"],
    ["Clinical Advisor", "Validates care model and alerts", "Day 1"],
    ["Compliance Lead", "HIPAA/FDA/SaMD path", "Day 1"],
    ["CTO", "Architecture and integration", "Day 1"],
    ["EHR Integration Lead", "FHIR/HL7 and EHR connectivity", "MVP"],
    ["Security Engineer", "Encryption, audit and access controls", "MVP"],
    ["Customer Success Lead", "Provider onboarding and usage", "Pilot"],
    ["Revenue Cycle Advisor", "Reimbursement validation", "Pilot"],
    ["Sales Lead", "Provider pipeline", "Pilot/Scale"],
  ];
}
function unitEconomics(report: FeasibilityReport): Cell[][] {
  const annualContract = acv(report);
  const cac = 250_000;
  const grossMargin = 72;
  const implementation = 60_000;
  const ltv = annualContract * 4 * (grossMargin / 100);
  return [
    ["ACV", money(report.financials.currency, annualContract), "Enterprise provider contract", "LOIs / paid pilots"],
    ["Gross margin", `${grossMargin}%`, "SaaS margin after cloud/support", "Pilot cost analysis"],
    ["CAC", money(report.financials.currency, cac), "Sales and implementation motion", "First 10 customers"],
    ["Implementation cost", money(report.financials.currency, implementation), "Onboarding, integration, training", "Pilot tracking"],
    ["Payback period", "18-22 months", "Sales efficiency", "CRM tracking"],
    ["LTV:CAC", `${(ltv / cac).toFixed(1)}:1`, "Four-year gross-profit model", "Renewal cohort"],
  ];
}
function revenueScenarios(report: FeasibilityReport): Cell[][] {
  const annualContract = acv(report);
  return [
    ["Optimistic", "20%", "60 providers", money(report.financials.currency, 60 * annualContract), "1%", "18 months"],
    ["Base Case", "60%", "30 providers", money(report.financials.currency, 30 * annualContract), "2.5%", "24 months"],
    ["Pessimistic", "20%", "10 providers", money(report.financials.currency, 10 * annualContract), "6%", "40+ months"],
  ];
}
function sensitivityRows(): Cell[][] {
  return [
    ["ACV", "+25%", "Base", "-25%", "Tests provider willingness to pay"],
    ["CAC", "-20%", "Base", "+30%", "Healthcare sales cycles can be long"],
    ["Implementation cost", "-20%", "Base", "+50%", "EHR/device complexity can destroy margin"],
    ["Churn", "1%", "2.5%", "5%", "Retention decides LTV"],
    ["Pilot conversion", "50%", "30%", "15%", "Validates GTM quality"],
    ["Reimbursement capture", "High", "Base", "Low", "Validates provider ROI"],
  ];
}
function phaseGates(): Cell[][] {
  return [
    ["Gate 1: Problem validation", "20 interviews, 3 LOIs, confirmed buyer pain", "Approve MVP"],
    ["Gate 2: Technical validation", "EHR path validated, 3 device integrations, HIPAA controls defined", "Approve paid pilot"],
    ["Gate 3: Commercial validation", "3 paid pilots, ACV validated, sales cycle understood", "Approve seed/scale funding"],
    ["Gate 4: Scale validation", "Retention >90%, CAC payback <18 months, gross margin target met", "Approve expansion"],
  ];
}

function drawWorkflow(pdf: jsPDF, y: number, title: string, reportId: string, section: SectionKey, nodes: string[], insight: string) {
  y = ensureSpace(pdf, y, 110, title, reportId, section);
  y = sub(pdf, y, insight, title, reportId, section);
  const startX = PAGE.margin;
  const boxW = 58;
  const boxH = 28;
  nodes.forEach((node, i) => {
    const x = startX + i * 62;
    setFill(pdf, i % 2 === 0 ? COLOR.highlight : [238, 250, 248]);
    setDraw(pdf, COLOR.border);
    pdf.roundedRect(x, y, boxW, boxH, 4, 4, "FD");
    setText(pdf, COLOR.text);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    const lines = pdf.splitTextToSize(node, boxW - 8) as string[];
    pdf.text(lines.slice(0, 3), x + 4, y + 9);
    if (i < nodes.length - 1) {
      setDraw(pdf, COLOR.blue);
      pdf.line(x + boxW + 2, y + 14, x + 60, y + 14);
    }
  });
  return y + 52;
}
function drawBars(pdf: jsPDF, y: number, title: string, reportId: string, section: SectionKey, rows: Array<[string, number]>, heading: string) {
  y = ensureSpace(pdf, y, 115, title, reportId, section);
  y = sub(pdf, y, heading, title, reportId, section);
  rows.forEach(([label, value], i) => {
    const yy = y + i * 15;
    setText(pdf, COLOR.text);
    pdf.setFontSize(7.2);
    pdf.text(label, PAGE.margin, yy);
    setDraw(pdf, COLOR.border);
    pdf.rect(PAGE.margin + 125, yy - 7, 150, 7);
    setFill(pdf, value >= 8 ? COLOR.teal : value >= 6 ? COLOR.amber : COLOR.red);
    pdf.rect(PAGE.margin + 125, yy - 7, Math.min(150, value * 15), 7, "F");
    pdf.text(score(value), PAGE.margin + 285, yy);
  });
  return y + rows.length * 15 + 16;
}
function drawFunnel(pdf: jsPDF, y: number, title: string, reportId: string, section: SectionKey, report: FeasibilityReport) {
  const tam = parseAmount(report.market.tamValue, 16_100_000_000) / 1_000_000_000;
  const sam = Math.min(parseAmount(report.market.samValue, 5_900_000_000) / 1_000_000_000, tam * 0.7);
  const som = Math.min(parseAmount(report.market.somValue, 850_000_000) / 1_000_000_000, sam * 0.25);
  y = ensureSpace(pdf, y, 110, title, reportId, section);
  y = sub(pdf, y, "TAM/SAM/SOM Funnel — SOM is reachable revenue, not guaranteed share", title, reportId, section);
  const rows = [["TAM", `$${tam.toFixed(1)}B`], ["SAM", `$${sam.toFixed(1)}B`], ["SOM", `$${(som * 1000).toFixed(0)}M`]];
  rows.forEach(([label, value], i) => {
    setFill(pdf, i === 0 ? COLOR.navy : i === 1 ? COLOR.blue : COLOR.teal);
    const width = 280 - i * 60;
    pdf.roundedRect(PAGE.margin + i * 30, y + i * 23, width, 17, 3, 3, "F");
    setText(pdf, COLOR.white);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.8);
    pdf.text(`${label}: ${value}`, PAGE.margin + i * 30 + 8, y + i * 23 + 12);
  });
  return y + 88;
}
function drawHeatmap(pdf: jsPDF, y: number, title: string, reportId: string, section: SectionKey) {
  y = ensureSpace(pdf, y, 150, title, reportId, section);
  y = sub(pdf, y, "Risk heatmap — healthcare feasibility is gated by integration, compliance and adoption", title, reportId, section);
  const x0 = PAGE.margin + 60;
  const y0 = y + 80;
  setDraw(pdf, COLOR.border);
  pdf.line(x0, y0, x0 + 180, y0);
  pdf.line(x0, y0, x0, y0 - 80);
  setText(pdf, COLOR.muted);
  pdf.setFontSize(7);
  pdf.text("Probability", x0 + 65, y0 + 18);
  pdf.text("Impact", x0 - 40, y0 - 40);
  const points: Array<[number, number, string, Rgb]> = [
    [150, 18, "EHR delay", COLOR.red],
    [125, 24, "HIPAA", COLOR.red],
    [120, 44, "Workflow", COLOR.amber],
    [95, 48, "Adherence", COLOR.amber],
    [86, 64, "Device data", COLOR.amber],
    [70, 30, "FDA", COLOR.red],
  ];
  points.forEach(([px, py, label, c]) => {
    setFill(pdf, c);
    pdf.circle(x0 + px, y0 - py, 4, "F");
    setText(pdf, COLOR.text);
    pdf.setFontSize(6.4);
    pdf.text(label, x0 + px + 6, y0 - py + 2);
  });
  return y + 110;
}

function addHealthcareReport(pdf: jsPDF, payload: PdfExportPayload) {
  const { report, inputs } = payload;
  const template = getReportTemplate(inputs, report);
  const title = inputs.projectName || "Secure Remote Patient Monitoring Application";
  const reportId = report.reportId || "Concept-AI";
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  let y = addPage(pdf, title, reportId, "Executive Decision");

  y = major(pdf, y, "1. Executive Decision Summary", "Conditional Proceed is the credible decision until paid pilots prove clinical and financial value", title, reportId, "Executive Decision");
  y = brief(pdf, y, "Recommendation: Conditional Proceed. The RPM opportunity is attractive, but scale funding should wait until paid pilots validate provider willingness to pay, EHR/device integration cost, reimbursement capture and clinical adoption.", title, reportId, "Executive Decision");
  y = table(pdf, y, title, reportId, "Executive Decision", [["Question", "Answer", "Implication"]], [
    ["Is the market attractive?", "Yes — aging population, chronic disease and home-based care support RPM demand.", "Strong market entry rationale."],
    ["Is the product technically feasible?", "Mostly yes, but EHR/device integration and data security are execution-heavy.", "Build MVP around limited integrations first."],
    ["Is the business model viable?", "Potentially, if ACV, implementation cost, retention and reimbursement value are validated.", "Do not assume scale economics before pilots."],
    ["Is the risk acceptable?", "Medium-high due to HIPAA, FDA/SaMD, adoption and cybersecurity exposure.", "Use phase gates and risk owners."],
    ["Final decision", recommendation, "Fund validation first, then scale after evidence."],
  ], { firstWidth: 110, fontSize: 7.1, highlightLast: true });
  y = para(pdf, y, "The project is feasible if the team proves that providers will pay, clinicians will use it, patients will adhere, and integrations can be delivered without destroying margin.", title, reportId, "Executive Decision");
  y = soWhat(pdf, y, "Market attractiveness is not enough. The next decision should approve validation funding, not full-scale rollout.", title, reportId, "Executive Decision");

  y = addPage(pdf, title, reportId, "Concept");
  y = major(pdf, y, "2. Concept Explanation Before Analysis", "The idea must be understood as a clinical workflow product, not a generic SaaS dashboard", title, reportId, "Concept");
  y = brief(pdf, y, "The Secure Remote Patient Monitoring Application connects patients, devices, clinicians, care teams and EHR systems to support post-discharge monitoring, chronic disease management, alerts and reimbursement documentation.", title, reportId, "Concept");
  y = para(pdf, y, "The product allows care teams to monitor patients outside the hospital using connected devices, mobile check-ins, automated alerts and EHR-connected dashboards. It should reduce manual follow-up, prioritize high-risk patients and support reimbursement capture without adding unnecessary work to nurses or physicians.", title, reportId, "Concept");
  y = drawWorkflow(pdf, y, title, reportId, "Concept", ["Patient", "Device/App", "Data validation", "Alert engine", "Care team", "EHR update", "Follow-up", "Outcome tracking"], "Remote Patient Monitoring Workflow");
  y = table(pdf, y, title, reportId, "Concept", [["Stakeholder", "Need", "Product value"]], [
    ["Health system", "Reduce readmissions and improve continuity", "Better post-discharge monitoring"],
    ["Clinic", "Manage chronic patients with less manual follow-up", "Automated tracking and alerts"],
    ["Patient", "Stay connected from home", "Simple app and device readings"],
    ["Nurse / care coordinator", "Prioritize high-risk patients", "Alert queue and workflow dashboard"],
    ["Physician", "Review meaningful trends", "Summary view and escalation logic"],
    ["Payer", "Reduce avoidable acute care cost", "Better preventive monitoring"],
  ], { firstWidth: 100, fontSize: 7.1 });
  y = soWhat(pdf, y, "The product wins only if it solves workflow friction, not just data collection. MVP scope should focus on clinician usability and integration proof.", title, reportId, "Concept");

  y = addPage(pdf, title, reportId, "Market");
  y = major(pdf, y, "3. Market Context", "RPM demand is strong, but provider adoption remains the gating factor", title, reportId, "Market");
  y = brief(pdf, y, "The RPM market is supported by aging populations, chronic disease growth, hospital readmission pressure and home-based care. TAM is context; revenue depends on paid pilots and retained provider contracts.", title, reportId, "Market");
  y = drawFunnel(pdf, y, title, reportId, "Market", report);
  y = table(pdf, y, title, reportId, "Market", [["Year", "TAM (USD, billions)", "SAM (USD, billions)", "Note"]], marketRows(report), { firstWidth: 65, fontSize: 7.4 });
  y = table(pdf, y, title, reportId, "Market", [["Market driver", "Why it matters"]], [
    ["Aging population", "More patients need home-based monitoring and chronic-care support."],
    ["Chronic disease growth", "Hypertension, diabetes and cardiac conditions create recurring monitoring needs."],
    ["Provider labor shortage", "Automated triage can reduce manual follow-up burden."],
    ["Readmission pressure", "Post-discharge monitoring can protect clinical and financial outcomes."],
    ["Telehealth normalization", "Remote care is now familiar to patients and providers."],
  ], { firstWidth: 140, fontSize: 7.2 });
  y = soWhat(pdf, y, "Market growth supports the case, but the investment decision should depend on adoption, reimbursement and integration economics.", title, reportId, "Market");

  y = addPage(pdf, title, reportId, "Product");
  y = major(pdf, y, "4. Product and Architecture", "Architecture must support devices, EHRs, clinical alerts and HIPAA controls from day one", title, reportId, "Product");
  y = brief(pdf, y, "The architecture should start narrow: one or two EHR paths, three device integrations, HIPAA controls, audit logs and alert logic validated by clinicians.", title, reportId, "Product");
  y = table(pdf, y, title, reportId, "Product", [["Layer", "Components", "Purpose"]], [
    ["Patient layer", "Mobile app, connected devices, patient check-ins", "Capture readings and symptoms from home"],
    ["Data ingestion", "Bluetooth, device APIs, FHIR/HL7, manual entry", "Bring readings into one normalized stream"],
    ["Security", "Encryption, access control, audit logs, consent", "Protect PHI and support compliance"],
    ["Intelligence", "Rules engine, risk scoring, anomaly detection", "Prioritize clinically meaningful signals"],
    ["Clinical workflow", "Dashboard, escalation queue, notes, tasks", "Help care teams act without extra work"],
    ["Integration", "Epic, Oracle Health/Cerner, Athena, billing", "Connect RPM workflow to provider operations"],
  ], { firstWidth: 105, fontSize: 7.1 });
  y = drawWorkflow(pdf, y, title, reportId, "Product", ["Patient app", "Device APIs", "FHIR/HL7", "Security", "Risk rules", "Dashboard", "EHR", "Billing"], "Target RPM Platform Architecture");
  y = soWhat(pdf, y, "EHR integration is not a later feature. It is a core adoption requirement and should be validated before paid pilot expansion.", title, reportId, "Product");

  y = addPage(pdf, title, reportId, "Competition");
  y = major(pdf, y, "5. Competitive Positioning", "The product should enter through a narrow clinical wedge, not generic RPM positioning", title, reportId, "Competition");
  y = brief(pdf, y, "The product should not compete as a generic RPM platform. It should focus on post-discharge and chronic-care workflows where providers need fast deployment, multi-device support and simple care-team adoption.", title, reportId, "Competition");
  y = table(pdf, y, title, reportId, "Competition", [["Competitor", "Strength", "Weakness", "Our wedge", "Proof needed"]], healthcareCompetitors(title), { firstWidth: 72, fontSize: 6.6 });
  y = soWhat(pdf, y, "Competitive advantage depends on workflow fit, integration speed and cost control, not broad feature claims.", title, reportId, "Competition");

  y = addPage(pdf, title, reportId, "FMART");
  y = major(pdf, y, "6. FMART Decision Scorecard", "High market score is offset by healthcare execution risk", title, reportId, "FMART");
  y = drawBars(pdf, y, title, reportId, "FMART", [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]], "FMART visual — risk-adjusted feasibility score");
  y = table(pdf, y, title, reportId, "FMART", [["Dimension", "Score", "Weight", "Confidence", "Key evidence", "Decision implication"]], fmartRows(report), { firstWidth: 72, scoreWidth: 45, fontSize: 6.2, highlightLast: true });
  y = para(pdf, y, "The overall score should not be read as automatic approval. A high market score is offset by execution risk. The correct decision is Conditional Proceed, with funding released only after validation gates are passed.", title, reportId, "FMART");
  y = soWhat(pdf, y, "FMART supports validation funding, not unconditional scale funding.", title, reportId, "FMART");

  y = addPage(pdf, title, reportId, "Financial");
  y = major(pdf, y, "7. Financial Model and Unit Economics", "Financial viability depends on ACV, implementation cost, churn and reimbursement capture", title, reportId, "Financial");
  y = brief(pdf, y, "The business is financially attractive only if enterprise ACV remains near USD 100k, implementation cost is controlled, and provider retention is strong. Full-scale funding should wait until paid pilots prove these assumptions.", title, reportId, "Financial");
  y = table(pdf, y, title, reportId, "Financial", [["Assumption", "Base case", "Rationale", "Validation method"]], unitEconomics(report), { firstWidth: 90, fontSize: 7.0 });
  y = table(pdf, y, title, reportId, "Financial", [["Scenario", "Probability", "Customers", "ARR", "Monthly churn", "Break-even"]], revenueScenarios(report), { firstWidth: 75, fontSize: 7.0 });
  y = table(pdf, y, title, reportId, "Financial", [["Driver", "Upside", "Base", "Downside", "Why it matters"]], sensitivityRows(), { firstWidth: 90, fontSize: 6.8 });
  y = soWhat(pdf, y, "Unit economics are not proven by market size. Paid pilots must validate ACV, CAC, implementation cost and retention.", title, reportId, "Financial");

  y = addPage(pdf, title, reportId, "Financial");
  y = major(pdf, y, "8. Reimbursement Model", "Provider ROI depends on documentation discipline and billing capture", title, reportId, "Financial");
  y = drawWorkflow(pdf, y, title, reportId, "Financial", ["Patient enrolled", "Readings collected", "Care team review", "Time documented", "Billing trigger", "Reimbursement", "ROI measured"], "RPM Reimbursement and Value Capture Flow");
  y = table(pdf, y, title, reportId, "Financial", [["Item", "Explanation"]], [
    ["Who pays", "Provider, clinic, health system or payer depending on model"],
    ["Who benefits", "Provider through reimbursement and lower readmissions; payer through avoided acute cost"],
    ["What must be documented", "Patient readings, care-team time, clinical review and follow-up actions"],
    ["Risk", "Reimbursement rules vary and require workflow discipline"],
    ["Validation", "Confirm billing workflow with provider revenue-cycle team during pilot"],
  ], { firstWidth: 120, fontSize: 7.2 });
  y = soWhat(pdf, y, "Do not assume reimbursement value. Validate eligibility, documentation burden, provider capture rate and payer rules.", title, reportId, "Financial");

  y = addPage(pdf, title, reportId, "Risk");
  y = major(pdf, y, "9. Healthcare Risk Register", "Healthcare risk must be owned, measurable and tied to investment gates", title, reportId, "Risk");
  y = brief(pdf, y, "The top risks are HIPAA breach, FDA/SaMD classification, EHR integration delay, clinician workflow rejection, low patient adherence and reimbursement capture failure.", title, reportId, "Risk");
  y = drawHeatmap(pdf, y, title, reportId, "Risk");
  y = table(pdf, y, title, reportId, "Risk", [["Risk", "Probability", "Impact", "Expected value", "Owner", "Early warning", "Mitigation", "Gate"]], healthcareRisks(report), { firstWidth: 60, fontSize: 5.9 });
  y = soWhat(pdf, y, "The risk profile is manageable only with early compliance work, limited integrations and clinician-led workflow design.", title, reportId, "Risk");

  y = addPage(pdf, title, reportId, "Compliance");
  y = major(pdf, y, "10. Compliance and Regulatory Path", "HIPAA, FDA/SaMD, cybersecurity and billing controls are mandatory before scale", title, reportId, "Compliance");
  y = table(pdf, y, title, reportId, "Compliance", [["Area", "Requirement", "Risk", "Required action"]], [
    ["HIPAA", "Protect PHI", "Breach and penalties", "Encryption, access control, audit logs"],
    ["FDA/SaMD", "Determine if product is medical device software", "Clearance delay", "Regulatory assessment before MVP"],
    ["Cybersecurity", "Protect device and patient data", "Breach and trust loss", "Threat model, pentest, SOC2 roadmap"],
    ["Data consent", "Patient authorization", "Legal exposure", "Consent flow and audit trail"],
    ["Clinical alerts", "Avoid unsafe escalation logic", "Liability", "Clinical review of alert rules"],
    ["Billing documentation", "Support reimbursement", "Revenue leakage", "Workflow aligned with billing team"],
  ], { firstWidth: 85, fontSize: 6.8 });
  y = soWhat(pdf, y, "Compliance is product design, not a legal appendix. It must be built into MVP scope.", title, reportId, "Compliance");

  y = addPage(pdf, title, reportId, "GTM");
  y = major(pdf, y, "11. Healthcare GTM Strategy", "Paid pilots are the main validation path", title, reportId, "GTM");
  y = table(pdf, y, title, reportId, "GTM", [["Channel", "Role", "Year 1 target", "Why it matters"]], healthcareGtmRows(), { firstWidth: 105, fontSize: 7.0 });
  y = table(pdf, y, title, reportId, "GTM", [["ICP requirement", "Why it matters"]], [
    ["US-based provider group or health system", "Matches reimbursement and compliance assumptions"],
    ["Chronic care or post-discharge patient volume", "Creates recurring monitoring need"],
    ["EHR integration need", "Validates core adoption requirement"],
    ["Care coordination team in place", "Supports clinical workflow adoption"],
    ["Willingness to run paid pilot", "Creates real validation signal"],
  ], { firstWidth: 170, fontSize: 7.1 });
  y = soWhat(pdf, y, "Free pilots create weak evidence. Require paid pilots with success metrics before scale funding.", title, reportId, "GTM");

  y = addPage(pdf, title, reportId, "Roadmap");
  y = major(pdf, y, "12. Implementation Roadmap and Decision Gates", "Scale funding should wait until validation gates are passed", title, reportId, "Roadmap");
  y = table(pdf, y, title, reportId, "Roadmap", [["Gate", "Required proof", "Decision"]], phaseGates(), { firstWidth: 125, fontSize: 7.0 });
  y = table(pdf, y, title, reportId, "Roadmap", [["Phase", "Timeline", "Deliverables", "Owner", "Go criteria"]], [
    ["Discovery", "0-8 weeks", "interviews, workflow map, reimbursement validation", "Product Lead", "3 LOIs"],
    ["MVP", "2-6 months", "app, dashboard, alerts, 2 device integrations", "CTO", "pilot-ready release"],
    ["Pilot", "6-12 months", "3 paid pilots, usage tracking, clinical feedback", "GM / Clinical Lead", "renewal intent"],
    ["Scale", "12-24 months", "sales engine, integrations, security certification", "CEO / CRO", "CAC payback <18 months"],
  ], { firstWidth: 75, fontSize: 6.7 });
  y = soWhat(pdf, y, "The roadmap is a funding control mechanism, not a project schedule only.", title, reportId, "Roadmap");

  y = addPage(pdf, title, reportId, "Roadmap");
  y = major(pdf, y, "13. Operating Model", "The team must combine healthcare, compliance, integration and customer success skills", title, reportId, "Roadmap");
  y = table(pdf, y, title, reportId, "Roadmap", [["Function", "Role", "When needed"]], healthcareOperatingModel(), { firstWidth: 110, fontSize: 7.0 });
  y = soWhat(pdf, y, "A healthcare RPM product cannot be built by a generic SaaS team alone. Clinical, compliance and revenue-cycle roles are required early.", title, reportId, "Roadmap");

  y = addPage(pdf, title, reportId, "Recommendations");
  y = major(pdf, y, "14. Strategic Recommendations", "The next phase should prove clinical usage and reimbursement economics before scale", title, reportId, "Recommendations");
  y = bullets(pdf, y, [
    "1. Start with post-discharge and chronic-care workflows — focus on high-pain use cases with clear clinical and financial motivation.",
    "2. Validate reimbursement before scaling — test billing workflow, documentation requirements and provider capture rate.",
    "3. Build EHR integration early — start with one or two target EHR systems.",
    "4. Design for nurses and care coordinators — prioritize alert triage, simple review and low-friction documentation.",
    "5. Control alert fatigue — prioritize clinically meaningful alerts and suppress low-value noise.",
    "6. Use paid pilots as the main validation path — require success metrics and renewal intent.",
    "7. Build security and compliance from day one — HIPAA, consent, audit logs and cybersecurity must be MVP scope.",
  ], title, reportId, "Recommendations");
  y = soWhat(pdf, y, "The correct next step is controlled validation, not broad market launch.", title, reportId, "Recommendations");

  y = addPage(pdf, title, reportId, "Appendix");
  y = major(pdf, y, "15. Final Decision and Score", "Conditional Proceed is the right investment decision", title, reportId, "Appendix");
  y = table(pdf, y, title, reportId, "Appendix", [["Area", "Score", "Rationale"]], [
    ["Market attractiveness", score(report.scores.market), "Strong demand, but crowded vendor landscape"],
    ["Product clarity", "8.5/10", "Clear workflow and buyer value after template correction"],
    ["Technical feasibility", score(report.scores.achievability), "Feasible but integration-heavy"],
    ["Financial feasibility", score(report.scores.financial), "Depends on ACV, CAC and implementation cost"],
    ["Regulatory feasibility", "7.0/10", "Manageable with early HIPAA/FDA/SaMD work"],
    ["GTM feasibility", "7.2/10", "Healthcare sales cycles are long"],
    ["Risk control", score(report.scores.risk), "Requires strong gates"],
    ["Overall", score(report.scores.overall), "Final decision: Conditional Proceed"],
  ], { firstWidth: 120, scoreWidth: 55, fontSize: 7.0, highlightLast: true });
  y = soWhat(pdf, y, "Attractive opportunity, but scale funding depends on paid pilots, integration proof, reimbursement validation and clinical adoption.", title, reportId, "Appendix");

  y = addPage(pdf, title, reportId, "Appendix");
  y = major(pdf, y, "16. Limitations and Assumptions", "The report is decision-useful but still requires primary validation", title, reportId, "Appendix");
  y = table(pdf, y, title, reportId, "Appendix", [["Field", "Details"]], [
    ["Assumptions", sanitizeForTemplate(clean(inputs.assumptions), template)],
    ["Constraints", sanitizeForTemplate(clean(inputs.constraints), template)],
    ["Success Factors", sanitizeForTemplate(clean(inputs.successFactors), template)],
    ["Known Risks", sanitizeForTemplate(clean(inputs.knownRisks), template)],
    ["Regulatory Considerations", sanitizeForTemplate(clean(inputs.regulatoryConsiderations), template)],
    ["Dependencies", sanitizeForTemplate(clean(inputs.dependencies), template)],
  ], { firstWidth: 120, fontSize: 7.0 });
  y = soWhat(pdf, y, "Primary validation must focus on workflow adoption, integration cost and reimbursement capture.", title, reportId, "Appendix");

  const citations = (report.research?.citations || []).slice(0, 8);
  if (citations.length) {
    y = addPage(pdf, title, reportId, "Appendix");
    y = major(pdf, y, "17. Source Notes", "Sources should support claims, not replace analysis", title, reportId, "Appendix");
    citations.forEach((citation, index) => {
      y = para(pdf, y, `${index + 1}. ${clean(citation.title)}. Source: ${clean(citation.source)}. Key takeaway: ${sanitizeForTemplate(clean(citation.takeaway), template)}. URL: ${clean(citation.url)}`, title, reportId, "Appendix");
    });
  }
}

function addGenericReport(pdf: jsPDF, payload: PdfExportPayload) {
  const { report, inputs } = payload;
  const template = getReportTemplate(inputs, report);
  const title = inputs.projectName || "Feasibility Report";
  const reportId = report.reportId || "Concept-AI";
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  let y = addPage(pdf, title, reportId, "Executive Decision");
  y = major(pdf, y, "1. Executive Decision Summary", `${template.label} feasibility depends on template-specific proof points`, title, reportId, "Executive Decision");
  y = brief(pdf, y, `${recommendation}. ${template.recommendationRule}`, title, reportId, "Executive Decision");
  y = table(pdf, y, title, reportId, "Executive Decision", [["Template", "Core terms", "Main compliance / control focus"]], [[template.label, template.coreTerms.join(", "), template.compliance.join(", ")]], { firstWidth: 90, fontSize: 7.0 });
  y = drawBars(pdf, y, title, reportId, "FMART", [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]], "FMART visual — risk-adjusted feasibility score");
  y = table(pdf, y, title, reportId, "FMART", [["Dimension", "Score", "Finding"]], [
    ["Financial", score(report.scores.financial), sanitizeForTemplate(clean(report.scores.financialFinding), template)],
    ["Market", score(report.scores.market), sanitizeForTemplate(clean(report.scores.marketFinding), template)],
    ["Achievability", score(report.scores.achievability), sanitizeForTemplate(clean(report.scores.achievabilityFinding), template)],
    ["Risk", score(report.scores.risk), sanitizeForTemplate(clean(report.scores.riskFinding), template)],
    ["Timing", score(report.scores.timing), sanitizeForTemplate(clean(report.scores.timingFinding), template)],
    ["Operational", score(report.scores.operational), sanitizeForTemplate(clean(report.scores.operationalFinding), template)],
    ["Overall", score(report.scores.overall), recommendation],
  ], { firstWidth: 110, scoreWidth: 55, fontSize: 7.0, highlightLast: true });
  y = soWhat(pdf, y, "The report now branches by template so public-sector, healthcare, SaaS, AI, marketplace, fintech and enterprise-software logic do not mix.", title, reportId, "Executive Decision");

  y = addPage(pdf, title, reportId, "Market");
  y = major(pdf, y, "2. Market and Business Context", "Market size is context; validation evidence drives the decision", title, reportId, "Market");
  y = para(pdf, y, sanitizeForTemplate(report.executiveSummary || "The concept requires market, financial, operational and risk validation before scale funding.", template), title, reportId, "Market");
  y = table(pdf, y, title, reportId, "Market", [["Field", "Details"]], [
    ["Project", clean(inputs.projectName)],
    ["Industry", clean(inputs.industry)],
    ["Location", clean(inputs.location)],
    ["Business Model", clean(inputs.businessModel)],
    ["Budget", clean(inputs.budgetRange)],
    ["Timeline", clean(inputs.timeline)],
  ], { firstWidth: 110, fontSize: 7.2 });
  y = table(pdf, y, title, reportId, "Market", [["Year", "TAM", "SAM", "Note"]], marketRows(report), { firstWidth: 65, fontSize: 7.4 });
  y = soWhat(pdf, y, "Decision-makers should treat market size as context and prioritize validation gates.", title, reportId, "Market");
}

export async function exportReportToPdfV2(_rootEl: HTMLElement, fileName: string, payload: PdfExportPayload) {
  await document.fonts?.ready;
  const { report, inputs } = payload;
  const template = getReportTemplate(inputs, report);
  const title = inputs.projectName || "Feasibility Report";
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });

  cover(pdf, report, inputs, template.type === "healthcare_rpm" ? "Healthcare RPM investment-grade feasibility case" : `${template.label} feasibility case`, recommendation);

  if (template.type === "healthcare_rpm") addHealthcareReport(pdf, payload);
  else addGenericReport(pdf, payload);

  (pdf as PdfWithAutoTable).putTotalPages?.(TOTAL_PAGES);
  pdf.save(fileName);
  return { fileName, pages: pdf.getNumberOfPages() };
}
