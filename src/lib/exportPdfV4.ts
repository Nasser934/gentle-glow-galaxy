import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import { sourceQuality, validateTemplateIntegrity } from "@/lib/reportTemplates";

type Payload = { report: FeasibilityReport; inputs: ConceptInputs };
type Rgb = [number, number, number];
type JsPdfAuto = jsPDF & { lastAutoTable?: { finalY: number }; putTotalPages?: (placeholder: string) => void };

type Section = {
  title: string;
  actionTitle: string;
  body?: string;
  table?: { head: string[]; rows: (string | number)[][] };
  bullets?: string[];
  soWhat: string;
};

const TOTAL = "{total_pages_count_string}";
const PAGE = { w: 595.28, h: 841.89, m: 42, bottom: 64 };
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

const setText = (pdf: jsPDF, c: Rgb) => pdf.setTextColor(...c);
const setFill = (pdf: jsPDF, c: Rgb) => pdf.setFillColor(...c);
const setDraw = (pdf: jsPDF, c: Rgb) => pdf.setDrawColor(...c);
const clean = (value: unknown, fallback = "—") => String(value ?? fallback).replace(/\\n/g, " ").replace(/\s+/g, " ").trim() || fallback;
const score = (value: number) => Number.isFinite(value) ? `${value.toFixed(1)}/10` : "—";
const limit = (items: string[] | undefined, fallback: string[]) => (items && items.length ? items : fallback).slice(0, 8).map((x) => clean(x));

function cover(pdf: jsPDF, report: FeasibilityReport, inputs: ConceptInputs, templateLabel: string, recommendation: string) {
  setFill(pdf, C.navy);
  pdf.rect(0, 0, PAGE.w, PAGE.h, "F");
  setText(pdf, C.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(26);
  pdf.text(pdf.splitTextToSize(clean(inputs.projectName), PAGE.w - PAGE.m * 2), PAGE.m, 150);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(`${clean(inputs.industry)} · ${clean(inputs.location)}`, PAGE.m, 230);
  setFill(pdf, C.teal);
  pdf.roundedRect(PAGE.m, 260, 190, 32, 4, 4, "F");
  setText(pdf, C.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(recommendation, PAGE.m + 12, 281);
  setText(pdf, C.white);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Report ${report.reportId} | ${templateLabel}`, PAGE.m, 725);
  pdf.text(`Confidential | Prepared by Concept AI | ${report.dateIssued}`, PAGE.m, 745);
}

function header(pdf: jsPDF, title: string, id: string, section: string) {
  setFill(pdf, C.navy);
  pdf.rect(0, 0, PAGE.w, 8, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setText(pdf, C.navy);
  pdf.text("CONCEPT AI · FEASIBILITY REPORT", PAGE.m, 28);
  pdf.setFont("helvetica", "normal");
  setText(pdf, C.muted);
  pdf.text(title, PAGE.w - PAGE.m, 28, { align: "right" });
  setDraw(pdf, C.border);
  pdf.line(PAGE.m, PAGE.h - 42, PAGE.w - PAGE.m, PAGE.h - 42);
  pdf.setFontSize(7.2);
  pdf.text(`Report ${id} | ${section} | Concept AI | Confidential | Page ${pdf.getNumberOfPages()} of ${TOTAL}`, PAGE.m, PAGE.h - 26);
}

function addPage(pdf: jsPDF, title: string, id: string, section: string) {
  pdf.addPage();
  header(pdf, title, id, section);
  return 62;
}

function ensurePage(pdf: jsPDF, y: number, need: number, title: string, id: string, section: string) {
  return y + need > PAGE.h - PAGE.bottom ? addPage(pdf, title, id, section) : y;
}

function titleBlock(pdf: jsPDF, y: number, section: Section, title: string, id: string) {
  y = ensurePage(pdf, y, 78, title, id, section.title);
  setFill(pdf, C.navy);
  pdf.rect(PAGE.m, y - 10, PAGE.w - PAGE.m * 2, 3, "F");
  setText(pdf, C.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  const lines = pdf.splitTextToSize(`${section.title.toUpperCase()} — ${section.actionTitle}`, PAGE.w - PAGE.m * 2) as string[];
  pdf.text(lines, PAGE.m, y + 10);
  setDraw(pdf, C.border);
  pdf.line(PAGE.m, y + 22 + (lines.length - 1) * 13, PAGE.w - PAGE.m, y + 22 + (lines.length - 1) * 13);
  return y + 42 + (lines.length - 1) * 13;
}

function paragraph(pdf: jsPDF, y: number, text: string, title: string, id: string, section: string) {
  const lines = pdf.splitTextToSize(clean(text), PAGE.w - PAGE.m * 2) as string[];
  y = ensurePage(pdf, y, lines.length * 12 + 10, title, id, section);
  setText(pdf, C.text);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.text(lines, PAGE.m, y);
  return y + lines.length * 12 + 10;
}

function soWhat(pdf: jsPDF, y: number, text: string, title: string, id: string, section: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, PAGE.w - PAGE.m * 2 - 20) as string[];
  y = ensurePage(pdf, y, lines.length * 11 + 26, title, id, section);
  setFill(pdf, C.teal);
  setDraw(pdf, C.teal);
  pdf.roundedRect(PAGE.m, y, PAGE.w - PAGE.m * 2, lines.length * 11 + 18, 4, 4, "F");
  setText(pdf, C.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.2);
  pdf.text(lines, PAGE.m + 10, y + 15);
  return y + lines.length * 11 + 28;
}

function table(pdf: jsPDF, y: number, section: Section, title: string, id: string) {
  if (!section.table?.rows.length) return y;
  autoTable(pdf, {
    startY: y,
    margin: { left: PAGE.m, right: PAGE.m },
    head: [section.table.head],
    body: section.table.rows.map((row) => row.map((cell) => clean(cell))),
    styles: { font: "helvetica", fontSize: 7.1, cellPadding: 5, textColor: C.text, lineColor: C.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: "bold" },
    alternateRowStyles: { fillColor: C.stripe },
    didDrawPage: () => header(pdf, title, id, section.title),
  });
  return ((pdf as JsPdfAuto).lastAutoTable?.finalY ?? y) + 16;
}

function bullets(pdf: jsPDF, y: number, section: Section, title: string, id: string) {
  if (!section.bullets?.length) return y;
  section.bullets.slice(0, 8).forEach((item) => {
    const lines = pdf.splitTextToSize(clean(item), PAGE.w - PAGE.m * 2 - 16) as string[];
    y = ensurePage(pdf, y, lines.length * 11 + 8, title, id, section.title);
    setText(pdf, C.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    pdf.text("•", PAGE.m, y);
    pdf.text(lines, PAGE.m + 15, y);
    y += lines.length * 11 + 6;
  });
  return y + 4;
}

function bars(pdf: jsPDF, y: number, rows: [string, number][], title: string, id: string, section: string) {
  y = ensurePage(pdf, y, rows.length * 18 + 30, title, id, section);
  setText(pdf, C.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Decision score visual", PAGE.m, y);
  y += 18;
  rows.forEach(([label, value]) => {
    setText(pdf, C.text);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    pdf.text(label, PAGE.m, y);
    setDraw(pdf, C.border);
    pdf.rect(PAGE.m + 135, y - 8, 160, 8);
    setFill(pdf, value >= 8 ? C.teal : value >= 6 ? C.amber : C.red);
    pdf.rect(PAGE.m + 135, y - 8, Math.min(160, value * 16), 8, "F");
    setText(pdf, C.text);
    pdf.text(score(value), PAGE.m + 305, y);
    y += 18;
  });
  return y + 10;
}

function flow(pdf: jsPDF, y: number, nodes: string[], title: string, id: string, section: string, caption: string) {
  y = ensurePage(pdf, y, 80, title, id, section);
  setText(pdf, C.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(caption, PAGE.m, y);
  y += 14;
  const width = 68;
  nodes.slice(0, 7).forEach((node, i) => {
    const x = PAGE.m + i * 74;
    setFill(pdf, i % 2 ? [238, 250, 248] : C.pale);
    setDraw(pdf, C.border);
    pdf.roundedRect(x, y, width, 32, 4, 4, "FD");
    setText(pdf, C.text);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.text((pdf.splitTextToSize(node, width - 8) as string[]).slice(0, 3), x + 4, y + 11);
    if (i < Math.min(nodes.length, 7) - 1) {
      setDraw(pdf, C.blue);
      pdf.line(x + width + 2, y + 16, x + 72, y + 16);
    }
  });
  return y + 50;
}

function templateData(templateLabel: string) {
  if (templateLabel.includes("Healthcare")) {
    return {
      concept: "A healthcare SaaS platform for remote patient monitoring, EHR integration, device data, clinical alerts, reimbursement documentation and patient adherence.",
      workflow: ["Patient", "Device/App", "Validation", "Alert engine", "Care team", "EHR", "Outcome"],
      competitors: [["Medtronic", "Device ecosystem", "Device lock-in", "Vendor-neutral RPM"], ["Philips", "Clinical trust", "Complex deployment", "Faster provider onboarding"], ["Dexcom / Abbott", "Device data", "Narrow disease focus", "Multi-condition monitoring"], ["Epic / EHR tools", "Embedded workflow", "Limited device flexibility", "Lightweight RPM layer"]],
      risks: [["HIPAA breach", "Med", "High", "CISO", "Encryption, RBAC, audit logs"], ["FDA/SaMD issue", "Med", "High", "Compliance Lead", "Regulatory assessment"], ["EHR delay", "High", "High", "Integration Lead", "Start with 1-2 EHRs"], ["Patient adherence", "Med", "Med", "Customer Success", "Onboarding and reminders"]],
      compliance: [["HIPAA", "Protect PHI", "Encryption, RBAC, audit logs"], ["FDA/SaMD", "Classify software risk", "Regulatory assessment"], ["Billing", "Support reimbursement", "Revenue-cycle validation"], ["Cybersecurity", "Protect device data", "Threat model and pentest"]],
      gtm: [["Health system pilots", "Primary entry", "3 paid pilots"], ["Specialty clinics", "Design partners", "5 partners"], ["EHR marketplace", "Distribution", "1-2 listings"], ["Device OEMs", "Data coverage", "3 devices"]],
    };
  }
  if (templateLabel.includes("Public-sector")) {
    return {
      concept: "A secure data exchange platform for public-sector entities, built around data-sharing agreements, accreditation, auditability, legacy integration and agency adoption.",
      workflow: ["Agency", "Agreement", "Ingestion", "Validation", "Exchange", "Audit", "Workflow"],
      competitors: [["Palantir", "Government footprint", "High price / black box", "Open auditable model"], ["IBM", "Enterprise relationships", "Complex implementation", "Faster modular deployment"], ["Tyler", "Justice workflows", "Narrow segment", "Cross-agency exchange"], ["Oracle / Microsoft", "Cloud scale", "Customization burden", "Prebuilt agency workflows"]],
      risks: [["Agency adoption", "High", "High", "Executive Sponsor", "Mandate lead sponsor"], ["Accreditation delay", "Med", "High", "Security Lead", "FedRAMP roadmap"], ["Legacy integration", "High", "Med", "CTO", "Top systems first"], ["Procurement delay", "Med", "Med", "Commercial Lead", "Pre-clear route"]],
      compliance: [["FedRAMP", "Accreditation", "Control roadmap"], ["Data-sharing agreements", "Legal basis", "Reusable templates"], ["Auditability", "Oversight", "Immutable logs"], ["Procurement", "Buying process", "Route validation"]],
      gtm: [["Agency pilots", "Validate use case", "2 sponsors"], ["Systems integrators", "Implementation", "2 partners"], ["Cloud marketplace", "Procurement", "1 listing"], ["Policy workshops", "Adoption", "3 workshops"]],
    };
  }
  return {
    concept: "A cloud collaboration SaaS that connects departmental work, shared knowledge, workflows and reporting across teams while reducing SaaS sprawl and fragmented data.",
    workflow: ["User/team", "Workspace", "Workflow", "Integration", "Shared data", "Analytics", "Controls"],
    competitors: [["Microsoft Teams", "Office distribution", "Workflow/data gaps", "Cross-tool workflow layer"], ["Slack", "Messaging ecosystem", "Fragmented analytics", "Structured collaboration"], ["Notion", "Flexible workspace", "Enterprise controls gap", "Governed departmental platform"], ["Asana / Monday", "Project workflows", "Limited knowledge layer", "Integrated work and data"]],
    risks: [["High CAC", "Med", "High", "CRO", "Narrow ICP and channels"], ["Churn", "Med", "High", "Customer Success", "Activation metrics"], ["Crowded market", "High", "Med", "CEO", "Clear wedge vs incumbents"], ["Integration burden", "Med", "Med", "CTO", "Top integrations first"]],
    compliance: [["SOC2", "Enterprise trust", "Control roadmap"], ["SSO/RBAC", "Admin control", "Identity integration"], ["Data privacy", "Customer data", "DPA and retention process"], ["Security review", "Enterprise sales", "Questionnaire pack"]],
    gtm: [["Enterprise outbound", "Primary motion", "30 accounts"], ["PLG teams", "Expansion motion", "500 trials"], ["Cloud marketplace", "Procurement", "1 listing"], ["Partners", "Implementation", "2 partners"]],
  };
}

function makeSections(report: FeasibilityReport, inputs: ConceptInputs, templateLabel: string, recommendation: string): Section[] {
  const td = templateData(templateLabel);
  const citations = report.research?.citations ?? [];
  return [
    { title: "1. Executive Decision Summary", actionTitle: `${templateLabel} feasibility depends on validated proof points`, body: `Recommendation: ${recommendation}. Overall score is ${score(report.scores.overall)}. The case should move through validation gates before scale funding unless evidence is already strong.`, table: { head: ["Question", "Answer", "Implication"], rows: [["Is the market attractive?", "Yes, but market size is context only", "Validate real demand"], ["Is the product feasible?", "Feasible if integrations and adoption are proven", "Start with a narrow MVP"], ["Is the business model viable?", "Potentially if ACV, CAC and retention hold", "Use paid pilots"], ["Final decision", recommendation, "Release funding by gate"]] }, soWhat: "The decision is conditional until customer, technical and financial proof points are validated." },
    { title: "2. Concept Explanation", actionTitle: "The idea must be clear before analysis begins", body: td.concept, table: { head: ["Stakeholder", "Need", "Product value"], rows: [["Buyer", "Reduce operational friction", "Unified workflow"], ["User", "Lower manual effort", "Simple daily workspace"], ["Finance", "Control cost", "Better unit economics"], ["Technology", "Reduce complexity", "Reusable architecture"]] }, soWhat: "The product must win through a specific workflow wedge, not generic platform language." },
    { title: "3. Product Workflow", actionTitle: "The workflow shows where value is created", body: "The target operating flow connects users, data, workflow actions, controls and reporting into one governed process.", bullets: td.workflow, soWhat: "Workflow clarity reduces product ambiguity and improves implementation discipline." },
    { title: "4. Market Context", actionTitle: "Market size supports the case, but does not prove revenue", body: report.research?.overview || report.executiveSummary, table: { head: ["Market layer", "Value", "CAGR", "Interpretation"], rows: [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel]] }, soWhat: "TAM/SAM/SOM should guide focus, but customer conversion and retention prove feasibility." },
    { title: "5. Customer Problem", actionTitle: "The pain must be budget-backed and frequent", body: "The strongest feasibility cases connect a named customer problem to a measurable budget owner and a clear adoption path.", table: { head: ["Field", "Evidence"], rows: [["Target profile", report.customer.ageLocation || inputs.industry], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Buying behavior", report.customer.behavior]] }, soWhat: "The report should validate whether the buyer sees the product as a must-have, not a nice-to-have." },
    { title: "6. Product Architecture", actionTitle: "Architecture must reduce implementation risk", body: "A feasible platform needs clear layers for user experience, workflow, integration, data, security and administration.", bullets: ["User experience layer", "Workflow layer", "Integration layer", "Data model", "Analytics", "Security and administration"], soWhat: "Integration burden can destroy margin if not scoped early." },
    { title: "7. Competitive Positioning", actionTitle: "Each incumbent requires a distinct wedge", table: { head: ["Competitor", "Strength", "Weakness", "Our wedge"], rows: td.competitors }, soWhat: "Do not compete as a generic platform. Win through a narrow, defensible wedge." },
    { title: "8. FMART Scorecard", actionTitle: "The score is useful only when tied to evidence", table: { head: ["Dimension", "Score", "Finding"], rows: [["Financial", score(report.scores.financial), report.scores.financialFinding], ["Market", score(report.scores.market), report.scores.marketFinding], ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding], ["Risk", score(report.scores.risk), report.scores.riskFinding], ["Timing", score(report.scores.timing), report.scores.timingFinding], ["Operational", score(report.scores.operational), report.scores.operationalFinding], ["Overall", score(report.scores.overall), recommendation]] }, soWhat: "A strong market score does not override execution risk." },
    { title: "9. Financial Model", actionTitle: "Viability depends on ACV, CAC, implementation cost and retention", table: { head: ["Scenario", "Probability", "Customers", "Revenue", "Break-even"], rows: report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]) }, soWhat: "The model should be treated as directional until paid pilots validate unit economics." },
    { title: "10. Unit Economics", actionTitle: "The model must show how one customer becomes profitable", table: { head: ["Metric", "Value", "Validation method"], rows: [["ACV", "Derived from scenario revenue", "Paid pilot / LOI"], ["Gross margin", "Target 70%+", "Cloud + support cost analysis"], ["CAC", "Track first 10 customers", "CRM evidence"], ["Payback", "Target <18 months", "Cohort analysis"], ["LTV:CAC", "Target >3:1", "Retention validation"]] }, soWhat: "Unit economics decide scale readiness more than the top-line market forecast." },
    { title: "11. Risk Register", actionTitle: "Risks need owners and measurable controls", table: { head: ["Risk", "Probability", "Impact", "Owner", "Mitigation"], rows: td.risks }, soWhat: "The project should stop or pivot if early-warning signals show the downside case is materializing." },
    { title: "12. Compliance and Controls", actionTitle: "Compliance must match the selected report type", table: { head: ["Area", "Requirement", "Required action"], rows: td.compliance }, soWhat: "Template-specific controls stop healthcare, public-sector and generic SaaS logic from mixing." },
    { title: "13. GTM Strategy", actionTitle: "The route to market must match the buyer", table: { head: ["Channel", "Role", "Year 1 target"], rows: td.gtm }, soWhat: "The GTM plan should validate willingness to pay before scaling spend." },
    { title: "14. Operating Model", actionTitle: "Execution needs named roles from day one", table: { head: ["Function", "Role", "When needed"], rows: [["Product Lead", "Own workflow and scope", "Day 1"], ["CTO", "Architecture and integration", "Day 1"], ["Security Lead", "Controls and reviews", "MVP"], ["Customer Success", "Onboarding and adoption", "Pilot"], ["Sales Lead", "Pipeline and conversion", "Pilot / Scale"]] }, soWhat: "Execution risk drops when ownership is clear." },
    { title: "15. Phase-Gate Roadmap", actionTitle: "Funding should be released through measurable gates", table: { head: ["Phase", "Timeline", "Goal", "Go criteria", "No-go trigger"], rows: [["0. Discovery", "0-8 weeks", "Validate buyer pain", "20 interviews, 3 LOIs", "Weak buyer interest"], ["1. MVP", "2-6 months", "Build narrow workflow", "Core integrations live", "Integration blocker"], ["2. Paid pilot", "6-12 months", "Prove adoption", "3 paid pilots, NPS >35", "Low usage"], ["3. Scale", "12-24 months", "Expand GTM", "CAC payback <18 months", "Poor economics"]] }, soWhat: "The roadmap is a decision system, not only a timeline." },
    { title: "16. Strategic Recommendations", actionTitle: "Actions must match the report type", bullets: limit(report.recommendations, ["Validate buyer pain before scaling", "Use paid pilots as proof", "Control integration scope", "Track unit economics", "Assign risk owners"]), soWhat: "Recommendations must be specific enough for executives to act on." },
    { title: "17. Limitations and Assumptions", actionTitle: "Assumptions must stay aligned with the selected template", table: { head: ["Area", "Assumption / limitation"], rows: [["Template", templateLabel], ["Market sizing", "Directional until source-backed validation"], ["Financial model", "Requires pilot data"], ["Risk", "Must be refreshed after discovery"], ["Sources", "Quality varies by source type"]] }, soWhat: "A credible report is clear about what is known, assumed and still unproven." },
    { title: "18. Source Notes", actionTitle: "Sources should be ranked by quality", table: { head: ["Quality", "Source", "Title", "Takeaway"], rows: citations.slice(0, 12).map((c) => [sourceQuality(c.source, c.title), c.source, c.title, c.takeaway]) }, soWhat: "Source quality matters. Primary and expert sources should carry more weight than generic market summaries." },
  ];
}

export async function exportReportToPdfV2(_root: HTMLElement, fileName: string, payload?: Payload): Promise<{ fileName: string }> {
  if (!payload) throw new Error("PDF export requires report payload.");
  const { report, inputs } = payload;
  const validation = validateTemplateIntegrity(inputs, report);
  if (validation.hasBlockingIssues) {
    throw new Error(`PDF export blocked: ${validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);
  }

  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const title = clean(inputs.projectName, "Feasibility Report");
  const id = report.reportId || "Concept-AI";
  const recommendation = validation.recommendation;
  const templateLabel = validation.template.label;
  cover(pdf, report, inputs, templateLabel, recommendation);

  const sections = makeSections(report, inputs, templateLabel, recommendation);
  sections.forEach((section, index) => {
    let y = addPage(pdf, title, id, section.title);
    y = titleBlock(pdf, y, section, title, id);
    if (section.title.includes("FMART")) {
      y = bars(pdf, y, [["Financial", report.scores.financial], ["Market", report.scores.market], ["Achievability", report.scores.achievability], ["Risk", report.scores.risk], ["Timing", report.scores.timing], ["Operational", report.scores.operational]], title, id, section.title);
    }
    if (section.title.includes("Product Workflow")) {
      y = flow(pdf, y, templateData(templateLabel).workflow, title, id, section.title, "Workflow diagram");
    }
    if (section.body) y = paragraph(pdf, y, section.body, title, id, section.title);
    y = table(pdf, y, section, title, id);
    y = bullets(pdf, y, section, title, id);
    soWhat(pdf, y, section.soWhat, title, id, section.title);
    if (index === sections.length - 1 && (pdf as JsPdfAuto).putTotalPages) (pdf as JsPdfAuto).putTotalPages?.(TOTAL);
  });

  pdf.save(fileName);
  return { fileName };
}
