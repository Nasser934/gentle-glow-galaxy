import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { getRecommendation, sourceQuality, validateTemplateIntegrity } from "@/lib/reportTemplates";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type Rgb = [number, number, number];
type Section = "Cover" | "Executive" | "Concept" | "Market" | "Customer" | "Product" | "Competition" | "FMART" | "Financial" | "Risk" | "Compliance" | "GTM" | "Operating Model" | "Roadmap" | "Recommendations" | "Appendix";
type PdfWithPages = jsPDF & { putTotalPages?: (placeholder: string) => void; lastAutoTable?: { finalY: number } };

const TOTAL = "{total_pages_count_string}";
const PAGE = { w: 595.28, h: 841.89, m: 44, b: 62 };
const C = {
  navy: [11, 31, 58] as Rgb,
  blue: [37, 99, 235] as Rgb,
  teal: [15, 118, 110] as Rgb,
  amber: [217, 119, 6] as Rgb,
  red: [185, 28, 28] as Rgb,
  text: [17, 24, 39] as Rgb,
  muted: [107, 114, 128] as Rgb,
  border: [209, 213, 219] as Rgb,
  stripe: [243, 244, 246] as Rgb,
  pale: [245, 250, 255] as Rgb,
  white: [255, 255, 255] as Rgb,
};

const txt = (pdf: jsPDF, color: Rgb) => pdf.setTextColor(...color);
const fill = (pdf: jsPDF, color: Rgb) => pdf.setFillColor(...color);
const draw = (pdf: jsPDF, color: Rgb) => pdf.setDrawColor(...color);
const clean = (v: unknown, fallback = "—") => String(v ?? fallback).replace(/\\n/g, " ").replace(/\s+/g, " ").replace(/Massive|massive|explosive/gi, "strong").trim() || fallback;
const score = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)}/10` : "—";
const num = (v: number) => Number.isFinite(v) ? Math.round(v).toLocaleString() : "—";
const money = (cur: string, v: number) => Number.isFinite(v) ? `${cur || "USD"} ${Math.round(v).toLocaleString()}` : "—";
const amount = (s: string, fallback: number) => {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const v = Number(m[1]);
  if (/b/i.test(s)) return v * 1_000_000_000;
  if (/m/i.test(s)) return v * 1_000_000;
  if (/k/i.test(s)) return v * 1_000;
  return v;
};
const cagr = (s: string, fallback: number) => {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : fallback;
};

function header(pdf: jsPDF, title: string, id: string, section: Section) {
  fill(pdf, C.navy); pdf.rect(0, 0, PAGE.w, 8, "F");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); txt(pdf, C.navy);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", PAGE.m, 28);
  pdf.setFont("helvetica", "normal"); txt(pdf, C.muted);
  pdf.text(title, PAGE.w - PAGE.m, 28, { align: "right" });
  draw(pdf, C.border); pdf.line(PAGE.m, PAGE.h - 42, PAGE.w - PAGE.m, PAGE.h - 42);
  pdf.setFontSize(7.2);
  pdf.text(`Report ${id} | ${section} | Concept AI | Confidential | Page ${pdf.getNumberOfPages()} of ${TOTAL}`, PAGE.m, PAGE.h - 26);
}
function add(pdf: jsPDF, title: string, id: string, section: Section) { pdf.addPage(); header(pdf, title, id, section); return 62; }
function space(pdf: jsPDF, y: number, h: number, title: string, id: string, section: Section) { return y + h > PAGE.h - PAGE.b ? add(pdf, title, id, section) : y; }
function h1(pdf: jsPDF, y: number, n: string, action: string, title: string, id: string, section: Section) {
  y = space(pdf, y, 62, title, id, section);
  fill(pdf, C.navy); pdf.rect(PAGE.m, y - 10, PAGE.w - PAGE.m * 2, 3, "F");
  txt(pdf, C.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(13);
  const lines = pdf.splitTextToSize(`${n.toUpperCase()} — ${action}`, PAGE.w - PAGE.m * 2) as string[];
  pdf.text(lines, PAGE.m, y + 10);
  draw(pdf, C.border); pdf.line(PAGE.m, y + 22 + (lines.length - 1) * 13, PAGE.w - PAGE.m, y + 22 + (lines.length - 1) * 13);
  return y + 42 + (lines.length - 1) * 13;
}
function h2(pdf: jsPDF, y: number, s: string, title: string, id: string, section: Section) {
  y = space(pdf, y, 24, title, id, section);
  txt(pdf, C.navy); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.5); pdf.text(s.toUpperCase(), PAGE.m, y);
  return y + 14;
}
function p(pdf: jsPDF, y: number, body: string, title: string, id: string, section: Section) {
  const lines = pdf.splitTextToSize(clean(body), PAGE.w - PAGE.m * 2) as string[];
  y = space(pdf, y, lines.length * 12 + 10, title, id, section);
  txt(pdf, C.text); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.6); pdf.text(lines, PAGE.m, y);
  return y + lines.length * 12 + 8;
}
function box(pdf: jsPDF, y: number, body: string, title: string, id: string, section: Section, color: Rgb = C.pale) {
  const lines = pdf.splitTextToSize(clean(body), PAGE.w - PAGE.m * 2 - 22) as string[];
  y = space(pdf, y, lines.length * 11 + 25, title, id, section);
  fill(pdf, color); draw(pdf, C.border); pdf.roundedRect(PAGE.m, y, PAGE.w - PAGE.m * 2, lines.length * 11 + 16, 4, 4, "FD");
  txt(pdf, color === C.teal ? C.white : C.text); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.3); pdf.text(lines, PAGE.m + 10, y + 15);
  return y + lines.length * 11 + 24;
}
function so(pdf: jsPDF, y: number, body: string, title: string, id: string, section: Section) { return box(pdf, y, `SO WHAT: ${body}`, title, id, section, C.teal); }
function tbl(pdf: jsPDF, y: number, title: string, id: string, section: Section, head: string[][], body: (string | number)[][], firstWidth?: number) {
  if (!body.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: PAGE.m, right: PAGE.m },
    head,
    body,
    styles: { font: "helvetica", fontSize: 7.1, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 }, textColor: C.text, lineColor: C.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.stripe },
    columnStyles: firstWidth ? { 0: { cellWidth: firstWidth, fontStyle: "bold" } } : {},
    didDrawPage: () => header(pdf, title, id, section),
  });
  return ((pdf as PdfWithPages).lastAutoTable?.finalY ?? y) + 16;
}
function bullets(pdf: jsPDF, y: number, items: string[], title: string, id: string, section: Section) {
  for (const item of items.slice(0, 8)) {
    const lines = pdf.splitTextToSize(clean(item), PAGE.w - PAGE.m * 2 - 18) as string[];
    y = space(pdf, y, lines.length * 11 + 8, title, id, section);
    txt(pdf, C.text); pdf.setFontSize(8.8); pdf.text("•", PAGE.m, y); pdf.text(lines, PAGE.m + 16, y);
    y += lines.length * 11 + 5;
  }
  return y + 4;
}
function barChart(pdf: jsPDF, y: number, rows: [string, number][], title: string, id: string, section: Section, caption: string) {
  y = h2(pdf, y, caption, title, id, section);
  rows.forEach(([label, value], i) => {
    const yy = y + i * 16;
    txt(pdf, C.text); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.3); pdf.text(label, PAGE.m, yy);
    draw(pdf, C.border); pdf.rect(PAGE.m + 135, yy - 8, 150, 8);
    fill(pdf, value >= 8 ? C.teal : value >= 6 ? C.amber : C.red); pdf.rect(PAGE.m + 135, yy - 8, Math.min(150, value * 15), 8, "F");
    txt(pdf, C.text); pdf.text(score(value), PAGE.m + 294, yy);
  });
  return y + rows.length * 16 + 12;
}
function flow(pdf: jsPDF, y: number, nodes: string[], title: string, id: string, section: Section, caption: string) {
  y = space(pdf, y, 82, title, id, section);
  y = h2(pdf, y, caption, title, id, section);
  const w = 68; const gap = 6;
  nodes.slice(0, 7).forEach((node, i) => {
    const x = PAGE.m + i * (w + gap);
    fill(pdf, i % 2 ? [238, 250, 248] : C.pale); draw(pdf, C.border); pdf.roundedRect(x, y, w, 30, 4, 4, "FD");
    txt(pdf, C.text); pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.2);
    pdf.text((pdf.splitTextToSize(node, w - 8) as string[]).slice(0, 3), x + 4, y + 10);
    if (i < Math.min(nodes.length, 7) - 1) { draw(pdf, C.blue); pdf.line(x + w + 1, y + 15, x + w + gap - 1, y + 15); }
  });
  return y + 48;
}

function rowsForTemplate(templateLabel: string, report: FeasibilityReport) {
  if (templateLabel.includes("Healthcare")) return {
    concept: "A healthcare SaaS platform for remote patient monitoring, EHR integration, device data, clinical alerts, reimbursement documentation and patient adherence.",
    workflow: ["Patient", "Device/App", "Validation", "Alert engine", "Care team", "EHR update", "Outcome"],
    architecture: ["Patient app", "Device APIs", "Security", "Rules engine", "Clinical dashboard", "EHR/FHIR", "Billing"],
    buyers: [["Health system", "Reduce readmissions", "Post-discharge monitoring"], ["Clinic", "Manage chronic patients", "Automated alerts"], ["Care team", "Prioritize high-risk patients", "Triage queue"], ["Payer", "Reduce avoidable acute care", "Preventive monitoring"]],
    competitors: [["Medtronic", "Device ecosystem", "Device lock-in", "Vendor-neutral RPM"], ["Philips", "Hospital trust", "Complex deployment", "Faster provider onboarding"], ["Dexcom/Abbott", "Device data", "Narrow disease focus", "Multi-condition workflow"], ["Epic/EHR tools", "Embedded workflow", "Limited device flexibility", "Lightweight RPM layer"]],
    risks: [["HIPAA breach", "Med", "High", "CISO", "Encryption, access control, audit logs"], ["FDA/SaMD issue", "Med", "High", "Compliance Lead", "Regulatory assessment before MVP"], ["EHR delay", "High", "High", "Integration Lead", "Start with 1-2 EHR paths"], ["Patient adherence", "Med", "Med", "Customer Success", "Onboarding and reminders"], ["Alert fatigue", "Med", "Med", "Clinical Lead", "Prioritization rules"]],
    gtm: [["Health system pilots", "Primary entry", "3 paid pilots"], ["Specialty clinics", "Design partners", "5 partners"], ["EHR marketplace", "Integration distribution", "1-2 listings"], ["Device OEMs", "Data coverage", "3 devices"]],
    compliance: [["HIPAA", "Protect PHI", "Encryption, RBAC, audit logs"], ["FDA/SaMD", "Classify software risk", "Regulatory assessment"], ["Cybersecurity", "Protect device and patient data", "Threat model and pentest"], ["Billing documentation", "Support reimbursement", "Validate with revenue-cycle team"]],
  };
  if (templateLabel.includes("Public-sector")) return {
    concept: "A secure data exchange platform for public-sector entities, built around data-sharing agreements, accreditation, auditability, legacy integration and agency adoption.",
    workflow: ["Agency sponsor", "Data agreement", "Ingestion", "Validation", "Secure exchange", "Audit log", "Agency workflow"],
    architecture: ["Agency systems", "API gateway", "Security layer", "Audit logs", "Policy engine", "Data products", "Dashboards"],
    buyers: [["Lead agency", "Share data safely", "Governed exchange"], ["Security office", "Reduce exposure", "Audit logs"], ["Operations teams", "Faster decisions", "Workflow access"], ["Procurement", "Compliant buying", "Accreditation path"]],
    competitors: [["Palantir", "Deep government footprint", "High price / black box", "Open and auditable model"], ["IBM", "Enterprise relationships", "Complex implementation", "Faster modular deployment"], ["Tyler", "Justice workflows", "Narrow segment", "Cross-agency exchange"], ["Oracle/Microsoft", "Cloud scale", "Customization burden", "Prebuilt agency workflows"]],
    risks: [["Agency adoption", "High", "High", "Executive Sponsor", "Mandate lead sponsor"], ["Accreditation delay", "Med", "High", "Security Lead", "FedRAMP roadmap"], ["Legacy integration", "High", "Med", "CTO", "Top systems first"], ["Procurement delay", "Med", "Med", "Commercial Lead", "Pre-clear route"]],
    gtm: [["Agency pilots", "Validate use case", "2 lead sponsors"], ["Systems integrators", "Implementation channel", "2 partners"], ["Cloud marketplace", "Procurement path", "1 listing"], ["Policy workshops", "Adoption support", "3 workshops"]],
    compliance: [["FedRAMP", "Security accreditation", "Roadmap and control mapping"], ["Data-sharing agreements", "Legal exchange basis", "Reusable agreement templates"], ["Auditability", "Oversight", "Immutable logs"], ["Procurement", "Public buying process", "Early route validation"]],
  };
  return {
    concept: "A cloud collaboration SaaS that connects departmental work, shared knowledge, workflows and reporting across teams while reducing SaaS sprawl and fragmented data.",
    workflow: ["User/team", "Workspace", "Workflow", "Integration", "Shared data", "Analytics", "Admin controls"],
    architecture: ["Web app", "Auth/SSO", "Workspace layer", "Integrations", "Data model", "Analytics", "Admin/security"],
    buyers: [["CIO", "Reduce SaaS sprawl", "Unified platform"], ["Department head", "Improve coordination", "Shared workflow"], ["End user", "Less tool switching", "Single workspace"], ["Finance", "Control spend", "Consolidation ROI"]],
    competitors: [["Microsoft Teams", "Office distribution", "Data/workflow gaps", "Cross-tool workflow layer"], ["Slack", "Messaging ecosystem", "Fragmented analytics", "Structured collaboration"], ["Notion", "Flexible workspace", "Enterprise controls gap", "Governed departmental platform"], ["Asana/Monday", "Project workflows", "Limited knowledge layer", "Integrated work + data" ]],
    risks: [["High CAC", "Med", "High", "CRO", "Narrow ICP and partner channels"], ["Churn", "Med", "High", "Customer Success", "Activation and adoption metrics"], ["Crowded market", "High", "Med", "CEO", "Clear wedge vs incumbents"], ["Integration burden", "Med", "Med", "CTO", "Top integrations first"]],
    gtm: [["Enterprise outbound", "Primary motion", "30 target accounts"], ["PLG teams", "Expansion motion", "500 trials"], ["Cloud marketplace", "Procurement", "1 listing"], ["Partners", "Implementation", "2 partners"]],
    compliance: [["SOC2", "Enterprise trust", "Control roadmap"], ["SSO/RBAC", "Admin control", "Identity integration"], ["Data privacy", "Customer data", "Retention and DPA process"], ["Security review", "Enterprise sales", "Questionnaire pack"]],
  };
}

function genericUnitEconomics(report: FeasibilityReport): (string | number)[][] {
  const cur = report.financials.currency || "USD";
  const acv = amount(report.financials.scenarios?.[1]?.annualRevenue || "$1,000,000", 1_000_000) / Math.max(amount(report.financials.scenarios?.[1]?.subscribersYr1 || "20", 20), 1);
  const cac = Math.max(acv * 1.4, 35_000);
  const ltv = acv * 4 * 0.75;
  return [["ACV", money(cur, acv), "Average annual contract", "Validate in paid pilots"], ["Gross margin", "75%", "SaaS margin after support/cloud", "Validate with first cohorts"], ["CAC", money(cur, cac), "Sales + marketing acquisition cost", "Track first 10 deals"], ["Payback", "14-20 months", "Enterprise SaaS efficiency", "CRM + finance tracking"], ["LTV:CAC", `${(ltv / cac).toFixed(1)}:1`, "4-year gross profit / CAC", "Improve through retention"]];
}

function addFullReport(pdf: jsPDF, payload: Payload) {
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  const template = validation.template;
  const recommendation = getRecommendation(report.scores.overall, report.scores.risk, template.type);
  const title = inputs.projectName || "Feasibility Report";
  const id = report.reportId || "Concept-AI";
  const cur = report.financials.currency || "USD";
  const data = rowsForTemplate(template.label, report);
  let y = 0;

  y = add(pdf, title, id, "Executive");
  y = h1(pdf, y, "1. Executive Decision Summary", `${template.label} feasibility depends on validated proof points`, title, id, "Executive");
  y = box(pdf, y, `Recommendation: ${recommendation}. ${template.recommendationRule}`, title, id, "Executive");
  y = tbl(pdf, y, title, id, "Executive", [["Question", "Answer", "Implication"]], [["Is the market attractive?", "Yes, but market size is context only.", "Use validation gates before scale funding."], ["Is the product feasible?", "Feasible if integrations and adoption are proven.", "Start with a narrow MVP."], ["Is the business model viable?", "Potentially, if ACV/CAC/retention hold.", "Validate unit economics with paid pilots."], ["Final decision", recommendation, "Approve gated validation, not blind scale." ]], 110);
  y = so(pdf, y, "The first page must make the decision clear. This is a gated investment case, not an automatic proceed.", title, id, "Executive");

  y = add(pdf, title, id, "Concept");
  y = h1(pdf, y, "2. Concept Explanation", "The idea is explained before analysis so decision-makers understand the product", title, id, "Concept");
  y = p(pdf, y, data.concept, title, id, "Concept");
  y = flow(pdf, y, data.workflow, title, id, "Concept", "Product workflow");
  y = tbl(pdf, y, title, id, "Concept", [["Stakeholder", "Need", "Product value"]], data.buyers, 110);
  y = so(pdf, y, "The product must win through workflow value, not generic platform claims.", title, id, "Concept");

  y = add(pdf, title, id, "Market");
  y = h1(pdf, y, "3. Market Context", "Market size supports the case, but validation evidence drives the decision", title, id, "Market");
  y = p(pdf, y, report.research?.overview || report.executiveSummary, title, id, "Market");
  const tam = amount(report.market.tamValue, 1_000_000_000) / 1_000_000_000;
  const sam = Math.min(amount(report.market.samValue, 350_000_000) / 1_000_000_000, tam * 0.7);
  const tamCagr = cagr(report.market.tamCagr, 0.1); const samCagr = cagr(report.market.samCagr, tamCagr);
  y = tbl(pdf, y, title, id, "Market", [["Year", "TAM (USD B)", "SAM (USD B)", "Note"]], Array.from({ length: 5 }, (_, i) => [2026 + i, (tam * Math.pow(1 + tamCagr, i)).toFixed(1), (sam * Math.pow(1 + samCagr, i)).toFixed(1), i === 0 ? "Base year" : "Forecast"]));
  y = flow(pdf, y, ["TAM", "SAM", "SOM", "ICP", "Paid pilots", "Retained accounts"], title, id, "Market", "Market funnel logic");
  y = so(pdf, y, "TAM does not equal revenue. The real test is reachable customer conversion and retention.", title, id, "Market");

  y = add(pdf, title, id, "Customer");
  y = h1(pdf, y, "4. Customer Problem", "The case is strongest when the pain is specific, frequent and budget-backed", title, id, "Customer");
  y = tbl(pdf, y, title, id, "Customer", [["Field", "Current evidence"]], [["Target customer", clean(report.customer.ageLocation || inputs.industry)], ["Goals", clean(report.customer.goals)], ["Willingness to pay", clean(report.customer.willingnessToPay)], ["Buying / adoption behavior", clean(report.customer.behavior)]], 140);
  y = bullets(pdf, y, report.research?.painPoints || ["Fragmented workflows", "Tool switching", "Low visibility", "Manual reporting"], title, id, "Customer");
  y = so(pdf, y, "The product must prove that the target buyer sees this as a budgeted priority, not a nice-to-have.", title, id, "Customer");

  y = add(pdf, title, id, "Product");
  y = h1(pdf, y, "5. Product and Architecture", "Architecture must reduce implementation risk and support the template-specific workflow", title, id, "Product");
  y = flow(pdf, y, data.architecture, title, id, "Product", "Target architecture layers");
  y = tbl(pdf, y, title, id, "Product", [["Layer", "Purpose", "Decision implication"]], data.architecture.map((x) => [x, "Core platform capability", "Validate during MVP"]), 130);
  y = so(pdf, y, "Architecture is part of feasibility. Integration burden can destroy margin if it is not scoped early.", title, id, "Product");

  y = add(pdf, title, id, "Competition");
  y = h1(pdf, y, "6. Competitive Positioning", "The product needs a specific wedge against each incumbent", title, id, "Competition");
  y = tbl(pdf, y, title, id, "Competition", [["Competitor", "Strength", "Weakness", "Our wedge"]], data.competitors, 105);
  y = so(pdf, y, "Do not compete as a generic platform. Win through a narrow wedge where incumbents are slow, costly or hard to adopt.", title, id, "Competition");

  y = add(pdf, title, id, "FMART");
  y = h1(pdf, y, "7. FMART Scorecard", "A high score does not mean automatic approval when risk remains material", title, id, "FMART");
  y = barChart(pdf, y, [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]], title, id, "FMART", "FMART visual — risk-adjusted feasibility score");
  y = tbl(pdf, y, title, id, "FMART", [["Dimension", "Score", "Finding"]], [["Financial", score(report.scores.financial), clean(report.scores.financialFinding)], ["Market", score(report.scores.market), clean(report.scores.marketFinding)], ["Achievability", score(report.scores.achievability), clean(report.scores.achievabilityFinding)], ["Risk", score(report.scores.risk), clean(report.scores.riskFinding)], ["Timing", score(report.scores.timing), clean(report.scores.timingFinding)], ["Operational", score(report.scores.operational), clean(report.scores.operationalFinding)], ["Overall", score(report.scores.overall), recommendation]], 105);
  y = so(pdf, y, "The overall score should be interpreted through risk and confidence, not as a standalone approval number.", title, id, "FMART");

  y = add(pdf, title, id, "Financial");
  y = h1(pdf, y, "8. Financial Model", "Financial viability depends on ACV, CAC, implementation cost, churn and retention", title, id, "Financial");
  y = tbl(pdf, y, title, id, "Financial", [["Metric", "Value", "Rationale", "Validation method"]], genericUnitEconomics(report), 120);
  y = tbl(pdf, y, title, id, "Financial", [["Scenario", "Probability", "Customers", "Annual revenue", "Break-even"]], report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]), 100);
  y = so(pdf, y, "The model is attractive only if acquisition and implementation costs stay under control and retention is proven.", title, id, "Financial");

  y = add(pdf, title, id, "Financial");
  y = h1(pdf, y, "9. Sensitivity Analysis", "Downside scenarios should be visible before scale funding", title, id, "Financial");
  y = tbl(pdf, y, title, id, "Financial", [["Variable", "Upside", "Base", "Downside", "Why it matters"]], [["ACV", "+25%", "Base", "-25%", "Tests willingness to pay"], ["CAC", "-20%", "Base", "+30%", "Sales efficiency"], ["Implementation cost", "-20%", "Base", "+50%", "Margin risk"], ["Churn", "Low", "Base", "High", "LTV risk"], ["Conversion", "High", "Base", "Half", "Pipeline quality"]], 120);
  y = so(pdf, y, "If the downside case breaks payback or cash runway, the next step should be validation, not expansion.", title, id, "Financial");

  y = add(pdf, title, id, "Risk");
  y = h1(pdf, y, "10. Risk Register", "Risk controls must have owners, warnings and gate impact", title, id, "Risk");
  y = tbl(pdf, y, title, id, "Risk", [["Risk", "Probability", "Impact", "Owner", "Mitigation"]], data.risks, 120);
  y = barChart(pdf, y, data.risks.map((r, i) => [String(r[0]), i < 2 ? 8 : i < 4 ? 6 : 5]), title, id, "Risk", "Expected risk exposure ranking");
  y = so(pdf, y, "Risk is manageable only if the gate criteria can stop or redirect the project before major capital is spent.", title, id, "Risk");

  y = add(pdf, title, id, "Compliance");
  y = h1(pdf, y, "11. Compliance and Controls", "Compliance requirements must match the selected report type", title, id, "Compliance");
  y = tbl(pdf, y, title, id, "Compliance", [["Area", "Requirement", "Required action"]], data.compliance, 120);
  y = so(pdf, y, "Compliance language is now template-specific. Healthcare, public-sector and generic SaaS controls must not be mixed.", title, id, "Compliance");

  y = add(pdf, title, id, "GTM");
  y = h1(pdf, y, "12. Go-to-Market Strategy", "The GTM motion must match the buyer and implementation reality", title, id, "GTM");
  y = tbl(pdf, y, title, id, "GTM", [["Channel", "Role", "Year 1 target"]], data.gtm, 130);
  y = tbl(pdf, y, title, id, "GTM", [["Sales step", "Purpose"]], [["1. Define ICP", "Narrow the first customer segment"], ["2. Run discovery", "Confirm workflow pain and budget"], ["3. Sell paid pilot", "Avoid weak free-pilot signals"], ["4. Measure usage", "Validate adoption"], ["5. Expand", "Move from pilot to retained contract"]], 130);
  y = so(pdf, y, "The GTM plan should prove willingness to pay and adoption before scaling spend.", title, id, "GTM");

  y = add(pdf, title, id, "Operating Model");
  y = h1(pdf, y, "13. Operating Model", "The team must cover product, integration, security, customer success and commercial execution", title, id, "Operating Model");
  y = tbl(pdf, y, title, id, "Operating Model", [["Function", "Role", "When needed"]], [["Product Lead", "Own scope and workflow", "Day 1"], ["CTO", "Architecture and integration", "Day 1"], ["Security Lead", "Controls and reviews", "MVP"], ["Customer Success", "Onboarding and adoption", "Pilot"], ["Sales Lead", "Pipeline and conversion", "Pilot/Scale"], ["Finance", "Unit economics and runway", "Day 1"]], 125);
  y = so(pdf, y, "Execution risk falls when each major risk has a named owner and clear responsibility.", title, id, "Operating Model");

  y = add(pdf, title, id, "Roadmap");
  y = h1(pdf, y, "14. Implementation Roadmap", "Funding should be released through measurable gates", title, id, "Roadmap");
  y = tbl(pdf, y, title, id, "Roadmap", [["Phase", "Timeline", "Goal", "Go criteria", "No-go trigger"]], [["0. Discovery", "0-8 weeks", "Validate buyer pain", "20 interviews, 3 LOIs", "Weak buyer interest"], ["1. MVP", "2-6 months", "Build narrow workflow", "Core integrations live", "Integration blocker"], ["2. Paid pilot", "6-12 months", "Prove adoption", "3 paid pilots, NPS >35", "Low usage"], ["3. Scale", "12-24 months", "Expand GTM", "CAC payback <18 months", "Poor economics"]], 80);
  y = flow(pdf, y, ["Discovery", "MVP", "Paid pilot", "Retain", "Scale", "Expand"], title, id, "Roadmap", "Phase-gate roadmap");
  y = so(pdf, y, "The project should advance only when the data supports the next funding tranche.", title, id, "Roadmap");

  y = add(pdf, title, id, "Recommendations");
  y = h1(pdf, y, "15. Strategic Recommendations", "Recommendations must be specific to the selected report type", title, id, "Recommendations");
  y = bullets(pdf, y, report.recommendations.length ? report.recommendations : template.scoreBoosters, title, id, "Recommendations");
  y = h2(pdf, y, "Decision gates", title, id, "Recommendations");
  y = tbl(pdf, y, title, id, "Recommendations", [["Gate", "Required proof", "Decision"]], [["Gate 1", "Buyer pain and budget validated", "Approve MVP"], ["Gate 2", "Integration and security validated", "Approve paid pilot"], ["Gate 3", "Paid pilot and ACV validated", "Approve scale funding"], ["Gate 4", "Retention and payback validated", "Approve expansion"]], 105);
  y = so(pdf, y, "The right decision is conditional until the proof points are met.", title, id, "Recommendations");

  y = add(pdf, title, id, "Appendix");
  y = h1(pdf, y, "16. Limitations and Assumptions", "Assumptions must match the selected report type", title, id, "Appendix");
  y = tbl(pdf, y, title, id, "Appendix", [["Area", "Assumption / limitation"]], [["Template", template.label], ["Score", "Directional until primary validation is completed"], ["Market sizing", "TAM/SAM/SOM are context, not guaranteed revenue"], ["Financials", "Unit economics require paid-pilot validation"], ["Risk", "Risk levels should be refreshed after discovery"]], 120);
  y = h1(pdf, y, "17. Source Notes", "Sources should be ranked by quality and tied to the report category", title, id, "Appendix");
  y = tbl(pdf, y, title, id, "Appendix", [["Quality", "Source", "Title", "Takeaway"]], (report.research?.citations || []).slice(0, 12).map((c) => [sourceQuality(c.source, c.title), c.source, c.title, c.takeaway]), 65);
}

export async function exportReportToPdfV2(_root: HTMLElement, fileName: string, payload?: Payload): Promise<{ fileName: string }> {
  if (!payload) throw new Error("PDF export requires report payload.");
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  if (validation.hasBlockingIssues) {
    throw new Error(`PDF export blocked: ${validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);
  }
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const template = validation.template;
  const recommendation = validation.recommendation;
  cover(pdf, report, inputs, `${template.label} investment-grade feasibility case`, recommendation);
  addFullReport(pdf, payload);
  if ((pdf as PdfWithPages).putTotalPages) (pdf as PdfWithPages).putTotalPages?.(TOTAL);
  pdf.save(fileName);
  return { fileName };
}
