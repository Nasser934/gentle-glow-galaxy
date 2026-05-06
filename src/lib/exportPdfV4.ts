import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConceptInputs, FeasibilityReport, ResearchCitation } from "@/types/analysis";
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

type TemplatePack = {
  concept: string;
  workflow: string[];
  workflowExplain: string;
  architecture: string[];
  competitors: (string | number)[][];
  risks: (string | number)[][];
  compliance: (string | number)[][];
  gtm: (string | number)[][];
  unitEconomics: (string | number)[][];
  sensitivity: (string | number)[][];
  sourceFallback: ResearchCitation[];
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
  pdf.roundedRect(PAGE.m, 260, 205, 32, 4, 4, "F");
  setText(pdf, C.white);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(recommendation, PAGE.m + 12, 281);
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
  pdf.setFontSize(9.3);
  pdf.text(lines, PAGE.m, y);
  return y + lines.length * 12 + 10;
}

function soWhat(pdf: jsPDF, y: number, text: string, title: string, id: string, section: string) {
  const lines = pdf.splitTextToSize(`SO WHAT: ${clean(text)}`, PAGE.w - PAGE.m * 2 - 20) as string[];
  y = ensurePage(pdf, y, lines.length * 11 + 26, title, id, section);
  setFill(pdf, C.teal);
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
    styles: { font: "helvetica", fontSize: 6.8, cellPadding: 4.2, textColor: C.text, lineColor: C.border, lineWidth: 0.2, overflow: "linebreak", valign: "top" },
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
    pdf.setFontSize(8.7);
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
  const count = Math.min(nodes.length, 8);
  y = ensurePage(pdf, y, 86, title, id, section);
  setText(pdf, C.navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(caption, PAGE.m, y);
  y += 14;
  const gap = 6;
  const usable = PAGE.w - PAGE.m * 2;
  const width = (usable - gap * (count - 1)) / count;
  nodes.slice(0, count).forEach((node, i) => {
    const x = PAGE.m + i * (width + gap);
    setFill(pdf, i % 2 ? [238, 250, 248] : C.pale);
    setDraw(pdf, C.border);
    pdf.roundedRect(x, y, width, 38, 4, 4, "FD");
    setText(pdf, C.text);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(5.6);
    pdf.text((pdf.splitTextToSize(node, width - 8) as string[]).slice(0, 4), x + 4, y + 11);
    if (i < count - 1) {
      setDraw(pdf, C.blue);
      pdf.line(x + width + 1, y + 19, x + width + gap - 1, y + 19);
    }
  });
  return y + 56;
}

function isDataInsights(label: string) {
  return /data insights|BI analytics/i.test(label);
}

function templateData(templateLabel: string): TemplatePack {
  if (templateLabel.includes("Healthcare")) {
    return {
      concept: "A healthcare SaaS platform for remote patient monitoring, EHR integration, device data, clinical alerts, reimbursement documentation and patient adherence.",
      workflow: ["Patient", "Device/App", "Validation", "Alert engine", "Care team", "EHR", "Outcome"],
      workflowExplain: "The target flow connects patients, devices, clinicians, EHR workflows and billing documentation.",
      architecture: ["Patient app and device layer", "Device ingestion", "Clinical alert engine", "EHR integration", "Billing documentation", "HIPAA controls", "Audit logs"],
      competitors: [["Medtronic", "Device ecosystem", "Device lock-in", "Vendor-neutral RPM", "Pilot device coverage"], ["Philips", "Clinical trust", "Complex deployment", "Faster provider onboarding", "Deployment benchmark"], ["Dexcom / Abbott", "Device data", "Narrow disease focus", "Multi-condition monitoring", "Clinical workflow proof"], ["Epic / EHR tools", "Embedded workflow", "Limited device flexibility", "Lightweight RPM layer", "EHR integration proof"]],
      risks: [["HIPAA breach", "Med", "High", "CISO", "Encryption, RBAC, audit logs", "Security incidents", "Block scale"], ["FDA/SaMD issue", "Med", "High", "Compliance Lead", "Regulatory assessment", "Classification uncertainty", "Delay MVP"], ["EHR delay", "High", "High", "Integration Lead", "Start with 1-2 EHRs", "Interface backlog", "Delay pilots"], ["Patient adherence", "Med", "Med", "Customer Success", "Onboarding and reminders", "Low weekly usage", "Redesign pilot"]],
      compliance: [["HIPAA", "Protect PHI", "Encryption, RBAC, audit logs"], ["FDA/SaMD", "Classify software risk", "Regulatory assessment"], ["Billing", "Support reimbursement", "Revenue-cycle validation"], ["Cybersecurity", "Protect device data", "Threat model and pentest"]],
      gtm: [["Health system pilots", "Primary entry", "3 paid pilots"], ["Specialty clinics", "Design partners", "5 partners"], ["EHR marketplace", "Distribution", "1-2 listings"], ["Device OEMs", "Data coverage", "3 devices"]],
      unitEconomics: [["ACV", "USD 50k-250k", "Paid pilot"], ["Gross margin", "70%+ target", "Cloud and support cost"], ["CAC", "Validate first 10 accounts", "CRM data"], ["Payback", "<18 months", "Cohort tracking"]],
      sensitivity: [["Patient adherence down", "Lower outcomes", "Redesign onboarding"], ["EHR cost up", "Margin pressure", "Limit integrations"], ["Reimbursement gap", "Revenue delay", "Billing validation"]],
      sourceFallback: [],
    };
  }
  if (templateLabel.includes("Public-sector")) {
    return {
      concept: "A secure data exchange platform for public-sector entities, built around data-sharing agreements, accreditation, auditability, legacy integration and agency adoption.",
      workflow: ["Agency", "Agreement", "Ingestion", "Validation", "Exchange", "Audit", "Workflow"],
      workflowExplain: "The target flow connects agency sponsors, data-sharing agreements, ingestion, exchange, audit and operational workflows.",
      architecture: ["Agency source systems", "Agreement and policy layer", "API ingestion", "Data validation", "Secure exchange", "Audit logs", "Workflow integration"],
      competitors: [["Palantir", "Government footprint", "High price / black box", "Open auditable model", "Agency sponsor proof"], ["IBM", "Enterprise relationships", "Complex implementation", "Faster modular deployment", "Implementation proof"], ["Tyler", "Justice workflows", "Narrow segment", "Cross-agency exchange", "Cross-domain proof"], ["Oracle / Microsoft", "Cloud scale", "Customization burden", "Prebuilt agency workflows", "Procurement route"]],
      risks: [["Agency adoption", "High", "High", "Executive Sponsor", "Mandate lead sponsor", "No lead agency", "Stop scale"], ["Accreditation delay", "Med", "High", "Security Lead", "FedRAMP roadmap", "Control gaps", "Delay launch"], ["Legacy integration", "High", "Med", "CTO", "Top systems first", "Interface blockers", "Rescope"], ["Procurement delay", "Med", "Med", "Commercial Lead", "Pre-clear route", "Buying route unclear", "Delay sales"]],
      compliance: [["FedRAMP", "Accreditation", "Control roadmap"], ["Data-sharing agreements", "Legal basis", "Reusable templates"], ["Auditability", "Oversight", "Immutable logs"], ["Procurement", "Buying process", "Route validation"]],
      gtm: [["Agency pilots", "Validate use case", "2 sponsors"], ["Systems integrators", "Implementation", "2 partners"], ["Cloud marketplace", "Procurement", "1 listing"], ["Policy workshops", "Adoption", "3 workshops"]],
      unitEconomics: [["Contract value", "USD 250k-1m", "Agency pilot"], ["Gross margin", "65%+ target", "Implementation tracking"], ["Sales cycle", "9-18 months", "Procurement evidence"], ["Payback", "By contract year 2", "Cohort tracking"]],
      sensitivity: [["Procurement slips", "Revenue delay", "Pre-clear route"], ["Integration cost up", "Margin pressure", "Limit scope"], ["Sponsor changes", "Adoption risk", "Multi-sponsor governance"]],
      sourceFallback: [],
    };
  }
  if (isDataInsights(templateLabel)) {
    return {
      concept: "An enterprise data insights platform that connects source systems, cleans and models business data, creates a governed semantic layer, and delivers real-time insights, alerts, dashboards and recommendations to business users.",
      workflow: ["Source systems", "Data ingestion", "Data quality checks", "Data model / semantic layer", "Analytics engine", "Insight dashboard", "Alerts / recommendations", "Business action tracking"],
      workflowExplain: "The target flow connects ERP, CRM, finance, sales, operations and HR data into governed metrics, real-time analytics, alerts, recommendations and tracked business actions.",
      architecture: ["Data source layer: ERP, CRM, finance, sales, operations and HR systems", "Ingestion layer: APIs, connectors, batch uploads and streaming", "Processing layer: cleansing, mapping, transformation and validation", "Semantic layer: governed KPIs, business definitions and metric catalog", "Analytics layer: dashboards, ad-hoc analysis, predictive analytics and anomaly detection", "Action layer: alerts, recommendations, workflow triggers and decision logs", "Security layer: SSO, RBAC, audit logs, encryption and data residency", "Admin layer: usage monitoring, data access and workspace governance"],
      competitors: [["Microsoft Power BI", "Microsoft ecosystem and low entry cost", "Requires modeling and governance work", "Faster time-to-insight through automated mapping and governed KPIs", "Pilot vs Power BI baseline"], ["Tableau", "Visualization and enterprise mindshare", "Dashboard-first experience can leave action gaps", "Insight-to-action workflow with tracked decisions", "Action usage proof"], ["Looker", "Semantic modeling and Google Cloud alignment", "Technical setup can slow adoption", "Business-user metric catalog and faster implementation", "Semantic layer proof"], ["Qlik", "Associative analytics", "Complexity for non-technical users", "Simpler governed metrics and alerts", "User adoption proof"], ["ThoughtSpot", "Search and AI analytics", "Needs mature data foundations", "Data quality checks and action workflow", "Data readiness proof"], ["Domo", "Integrated BI and apps", "Platform breadth can dilute focus", "Executive time-to-insight wedge", "Executive pilot proof"], ["Sigma Computing", "Cloud warehouse-native analytics", "Depends on modern data stack maturity", "Broader connector and KPI governance layer", "Connector proof"], ["Mode", "Analyst workflow", "Less executive action tracking", "Business action layer", "Action tracking proof"]],
      risks: [["Weak differentiation vs BI incumbents", "High", "High", "CEO", "Prove time-to-insight wedge", "Buyer compares to Power BI/Tableau", "Block scale funding"], ["Integration delays", "High", "High", "CTO", "Prioritize ERP, CRM and finance connectors", "Connector backlog grows", "Delay pilots"], ["Poor data quality", "High", "High", "Data Lead", "Add quality checks and exception workflow", "Users distrust metrics", "Pause rollout"], ["Low user adoption", "Med", "High", "Customer Success", "Embed insights into routines", "Low weekly active use", "Redesign workflow"], ["High CAC", "Med", "High", "CRO", "Use narrow ICP and outcome-led pilots", "CAC payback >18 months", "Limit GTM spend"], ["Dashboard fatigue", "Med", "Med", "Product Lead", "Sell alerts, recommendations and actions", "Low dashboard return visits", "Rework product wedge"], ["Security/privacy concern", "Med", "High", "CISO", "SSO, RBAC, audit logs, encryption", "Security review gaps", "Delay enterprise launch"], ["Low expansion revenue", "Med", "High", "CRO", "Set department expansion criteria", "No second department demand", "Stop scale"], ["Custom implementation overload", "Med", "High", "COO", "Standardize connector packages", "Services margin below target", "Rescope"], ["Low retention", "Med", "High", "Customer Success", "Track decision usage and time saved", "Renewal risk rises", "Hold expansion"]],
      compliance: [["SOC 2", "Enterprise trust", "Control roadmap and evidence collection"], ["ISO 27001", "Security management", "Policy and control mapping"], ["GDPR / CCPA", "Personal data protection", "DPA, retention and consent process"], ["SSO / RBAC", "Access control", "Identity integration and role model"], ["Audit logs", "Decision and data traceability", "Immutable access and change logs"], ["Data residency", "Regional controls", "Hosting and data location policy"]],
      gtm: [["Enterprise outbound to CIO/CDO/COO/CFO", "Primary motion", "30 named accounts"], ["CFO/COO use-case selling", "Outcome-led entry", "3 pilot use cases"], ["Department-led land and expand", "Expansion motion", "3 paid pilots"], ["BI modernization campaigns", "Demand generation", "2 campaigns"], ["Cloud marketplace", "Procurement", "1 listing"], ["Data consulting partners", "Implementation", "2 partners"], ["Executive dashboard pilots", "Proof vehicle", "Baseline time-to-insight"]],
      unitEconomics: [["ACV", "USD 120k", "Paid pilot and first enterprise contract"], ["Implementation cost/customer", "USD 30k-60k target", "Connector and onboarding cost tracking"], ["CAC", "USD 60k-90k target", "First 10 account CRM evidence"], ["Gross margin", "70-80% target", "Cloud, support and services cost"], ["Payback", "<18 months", "Cohort analysis"], ["Churn", "<10% annual target", "Renewal data"], ["NRR", ">110% target", "Expansion revenue proof"], ["LTV:CAC", ">3:1 target", "Retention and CAC validation"], ["Sales cycle", "6-9 months target", "Pipeline aging"], ["Expansion revenue", "30%+ by year 2", "Second department adoption"]],
      sensitivity: [["ACV down 25%", "Break-even moves later", "Tighten ICP and outcome pricing"], ["CAC up 30%", "Payback may exceed target", "Partner-led pipeline and narrower accounts"], ["Implementation cost up 50%", "Gross margin pressure", "Standardize connectors and scope"], ["Churn doubles", "LTV:CAC falls", "Add adoption and success gates"], ["Sales cycle +3 months", "Cash conversion delay", "Use paid pilots and marketplace"], ["Gross margin drops 10 points", "Scale funding risk", "Automate mapping and reduce services"], ["Expansion underperforms", "Land-and-expand risk", "Define department expansion proof early"]],
      sourceFallback: [
        { title: "Magic Quadrant for Analytics and Business Intelligence Platforms", source: "Gartner", url: "https://www.gartner.com/en/documents/analytics-business-intelligence-platforms", takeaway: "Supports BI platform category and incumbent landscape." },
        { title: "Power BI official product page", source: "Microsoft", url: "https://powerbi.microsoft.com/", takeaway: "Supports Power BI competitor strength and Microsoft ecosystem position." },
        { title: "Tableau official product page", source: "Salesforce Tableau", url: "https://www.tableau.com/", takeaway: "Supports Tableau competitor positioning and visualization strength." },
        { title: "Looker official product page", source: "Google Cloud", url: "https://cloud.google.com/looker", takeaway: "Supports Looker semantic layer and Google Cloud positioning." },
        { title: "The data-driven enterprise of 2025", source: "McKinsey", url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-data-driven-enterprise-of-2025", takeaway: "Supports the need for faster data-driven decision making." },
      ],
    };
  }
  return {
    concept: "A cloud collaboration SaaS that connects departmental work, shared knowledge, workflows and reporting across teams while reducing SaaS sprawl and fragmented data.",
    workflow: ["User/team", "Workspace", "Workflow", "Integration", "Shared data", "Analytics", "Controls"],
    workflowExplain: "The target operating flow connects users, data, workflow actions, controls and reporting into one governed process.",
    architecture: ["User experience layer", "Workflow layer", "Integration layer", "Data model", "Analytics", "Security and administration"],
    competitors: [["Microsoft Teams", "Office distribution", "Workflow/data gaps", "Cross-tool workflow layer", "Activation proof"], ["Slack", "Messaging ecosystem", "Fragmented analytics", "Structured collaboration", "Workflow proof"], ["Notion", "Flexible workspace", "Enterprise controls gap", "Governed departmental platform", "Governance proof"], ["Asana / Monday", "Project workflows", "Limited knowledge layer", "Integrated work and data", "Retention proof"]],
    risks: [["High CAC", "Med", "High", "CRO", "Narrow ICP and channels", "CAC rising", "Limit spend"], ["Churn", "Med", "High", "Customer Success", "Activation metrics", "Low usage", "Hold scale"], ["Crowded market", "High", "Med", "CEO", "Clear wedge vs incumbents", "Weak win rate", "Reposition"], ["Integration burden", "Med", "Med", "CTO", "Top integrations first", "Backlog grows", "Rescope"]],
    compliance: [["SOC2", "Enterprise trust", "Control roadmap"], ["SSO/RBAC", "Admin control", "Identity integration"], ["Data privacy", "Customer data", "DPA and retention process"], ["Security review", "Enterprise sales", "Questionnaire pack"]],
    gtm: [["Enterprise outbound", "Primary motion", "30 accounts"], ["PLG teams", "Expansion motion", "500 trials"], ["Cloud marketplace", "Procurement", "1 listing"], ["Partners", "Implementation", "2 partners"]],
    unitEconomics: [["ACV", "Derived from scenario revenue", "Paid pilot / LOI"], ["Gross margin", "Target 70%+", "Cloud + support cost analysis"], ["CAC", "Track first 10 customers", "CRM evidence"], ["Payback", "Target <18 months", "Cohort analysis"], ["LTV:CAC", "Target >3:1", "Retention validation"]],
    sensitivity: [["ACV down", "Payback later", "Tighten pricing"], ["CAC up", "Margin pressure", "Narrow ICP"], ["Churn up", "Lower LTV", "Improve activation"]],
    sourceFallback: [],
  };
}

function sourceRows(report: FeasibilityReport, td: TemplatePack) {
  const citations = report.research?.citations?.length ? report.research.citations : td.sourceFallback;
  return citations.slice(0, 12).map((c) => [sourceQuality(c.source, c.title), c.source, c.title, c.takeaway]);
}

function makeSections(report: FeasibilityReport, inputs: ConceptInputs, templateLabel: string, recommendation: string): Section[] {
  const td = templateData(templateLabel);
  const dataInsights = isDataInsights(templateLabel);
  const execBody = dataInsights
    ? "Recommendation: Conditional Proceed. The platform has a strong opportunity because enterprises struggle with fragmented data, slow reporting and inconsistent KPIs. It can win if it focuses on faster time-to-insight, governed metrics and action-oriented analytics rather than generic dashboards. Scale funding should wait until paid pilots validate integration effort, ACV, adoption, CAC payback and differentiation against Power BI, Tableau and Looker."
    : `Recommendation: ${recommendation}. Overall score is ${score(report.scores.overall)}. The case should move through validation gates before scale funding unless evidence is already strong.`;

  return [
    { title: "1. Executive Decision Summary", actionTitle: `${templateLabel} feasibility depends on validated proof points`, body: execBody, table: { head: ["Question", "Answer", "Implication"], rows: [["Decision", recommendation, "Release funding by gate"], ["Why now", dataInsights ? "AI-enabled analytics, data democratization and real-time decision needs" : "Buyer pressure and digitization", "Validate demand"], ["Why this can win", dataInsights ? "Time-to-insight, governed KPIs and action tracking" : "Specific workflow wedge", "Prove wedge"], ["Next proof needed", "Paid pilots, integrations, ACV, CAC and retention", "Do not scale before proof"]] }, soWhat: "The decision is conditional until customer, technical and financial proof points are validated." },
    { title: "2. Concept Explanation", actionTitle: "The idea must be clear before analysis begins", body: td.concept, table: { head: ["Stakeholder", "Need", "Product value"], rows: dataInsights ? [["COO / CFO", "Real-time business visibility", "Governed executive insights"], ["CIO / CDO", "Trusted data layer", "Semantic layer and access controls"], ["Department leader", "Faster decisions", "Alerts and recommendations"], ["Analyst", "Less manual reporting", "Automated mapping and KPI catalog"]] : [["Buyer", "Reduce operational friction", "Unified workflow"], ["User", "Lower manual effort", "Simple daily workspace"], ["Finance", "Control cost", "Better unit economics"], ["Technology", "Reduce complexity", "Reusable architecture"]] }, soWhat: dataInsights ? "The product must sell business outcomes and faster decisions, not another dashboard layer." : "The product must win through a specific workflow wedge, not generic platform language." },
    { title: "3. Product Workflow", actionTitle: "The workflow shows where value is created", body: td.workflowExplain, bullets: td.workflow, soWhat: "Workflow clarity reduces product ambiguity and improves implementation discipline." },
    { title: "4. Market Context", actionTitle: "Market size supports the case, but does not prove revenue", body: report.research?.overview || report.executiveSummary, table: { head: ["Market layer", "Value", "CAGR", "Interpretation"], rows: [["TAM", report.market.tamValue, report.market.tamCagr, report.market.tamLabel], ["SAM", report.market.samValue, report.market.samCagr, report.market.samLabel], ["SOM", report.market.somValue, report.market.somCagr, report.market.somLabel], ["Formula note", "Directional", "Source-backed refresh needed", "Add source, year and confidence before investment approval"]] }, soWhat: "TAM/SAM/SOM should guide focus, but customer conversion and retention prove feasibility." },
    { title: "5. Customer Problem", actionTitle: "The pain must be budget-backed and frequent", body: dataInsights ? "The strongest buyer pain is slow manual reporting, fragmented systems, inconsistent KPIs and weak real-time decision visibility across functions." : "The strongest feasibility cases connect a named customer problem to a measurable budget owner and a clear adoption path.", table: { head: ["Field", "Evidence"], rows: [["Target profile", report.customer.ageLocation || inputs.industry], ["Goals", report.customer.goals], ["Willingness to pay", report.customer.willingnessToPay], ["Buying behavior", report.customer.behavior], ["Budget owner", dataInsights ? "COO, CFO, CIO or Data Office" : "Economic buyer to validate"]] }, soWhat: "The report should validate whether the buyer sees the product as a must-have, not a nice-to-have." },
    { title: "6. Product Architecture", actionTitle: dataInsights ? "Architecture must turn fragmented data into governed action" : "Architecture must reduce implementation risk", body: dataInsights ? "The architecture should connect source systems, ingestion, transformation, semantic governance, analytics, action tracking, security and administration." : "A feasible platform needs clear layers for user experience, workflow, integration, data, security and administration.", bullets: td.architecture, soWhat: "Integration burden can destroy margin if not scoped early." },
    { title: "7. Competitive Positioning", actionTitle: "Each incumbent requires a distinct wedge", table: { head: ["Competitor", "Strength", "Weakness", "Our wedge", "Proof needed"], rows: td.competitors }, soWhat: dataInsights ? "The wedge must be faster time-to-insight and action tracking against BI incumbents, not generic collaboration." : "Do not compete as a generic platform. Win through a narrow, defensible wedge." },
    { title: "8. FMART Scorecard", actionTitle: "The score is useful only when tied to evidence", table: { head: ["Dimension", "Score", "Finding"], rows: [["Financial", score(report.scores.financial), report.scores.financialFinding], ["Market", score(report.scores.market), report.scores.marketFinding], ["Achievability", score(report.scores.achievability), report.scores.achievabilityFinding], ["Risk", score(report.scores.risk), report.scores.riskFinding], ["Timing", score(report.scores.timing), report.scores.timingFinding], ["Operational", score(report.scores.operational), report.scores.operationalFinding], ["Overall", score(report.scores.overall), recommendation]] }, soWhat: "A strong market score does not override execution risk." },
    { title: "9. Financial Model", actionTitle: "Viability depends on ACV, CAC, implementation cost and retention", table: { head: ["Scenario", "Probability", "Customers", "Revenue", "Break-even"], rows: report.financials.scenarios.map((s) => [s.scenario, s.probability, s.subscribersYr1, s.annualRevenue, s.breakEven]) }, soWhat: "The model should be treated as directional until paid pilots validate unit economics." },
    { title: "10. Unit Economics", actionTitle: "The model must show how one customer becomes profitable", table: { head: ["Metric", "Value", "Validation method"], rows: td.unitEconomics }, soWhat: "Unit economics decide scale readiness more than the top-line market forecast." },
    { title: "11. Sensitivity Analysis", actionTitle: "Downside cases must show what breaks the investment case", table: { head: ["Sensitivity", "Impact", "Mitigation"], rows: td.sensitivity }, soWhat: "The case should be stress-tested before scale funding is released." },
    { title: "12. Risk Register", actionTitle: "Risks need owners and measurable controls", table: { head: ["Risk", "Probability", "Impact", "Owner", "Mitigation", "Early warning", "Gate impact"], rows: td.risks }, soWhat: "The project should stop or pivot if early-warning signals show the downside case is materializing." },
    { title: "13. Compliance and Controls", actionTitle: "Compliance must match the selected report type", table: { head: ["Area", "Requirement", "Required action"], rows: td.compliance }, soWhat: "Template-specific controls stop healthcare, public-sector and generic SaaS logic from mixing." },
    { title: "14. GTM Strategy", actionTitle: "The route to market must match the buyer", table: { head: ["Channel", "Role", "Year 1 target"], rows: td.gtm }, soWhat: "The GTM plan should validate willingness to pay before scaling spend." },
    { title: "15. Operating Model", actionTitle: "Execution needs named roles from day one", table: { head: ["Function", "Role", "When needed"], rows: [["Product Lead", dataInsights ? "Own time-to-insight wedge and use-case scope" : "Own workflow and scope", "Day 1"], ["CTO", "Architecture and integration", "Day 1"], ["Data Lead", dataInsights ? "Own semantic layer, quality and KPI catalog" : "Own data model", "MVP"], ["Security Lead", "Controls and reviews", "MVP"], ["Customer Success", "Onboarding and adoption", "Pilot"], ["Sales Lead", "Pipeline and conversion", "Pilot / Scale"]] }, soWhat: "Execution risk drops when ownership is clear." },
    { title: "16. Phase-Gate Roadmap", actionTitle: "Funding should be released through measurable gates", table: { head: ["Phase", "Timeline", "Goal", "Go criteria", "No-go trigger"], rows: dataInsights ? [["0. Discovery", "0-8 weeks", "Validate data pain", "20 interviews, 3 paid pilot targets, baseline time-to-insight", "Weak buyer interest"], ["1. MVP", "2-6 months", "Build one use case", "ERP/CRM/finance connector live, KPI catalog v1", "Integration blocker"], ["2. Paid pilot", "6-12 months", "Prove adoption", "3 paid pilots, weekly active use, time-to-insight improvement", "Low usage"], ["3. Scale", "12-24 months", "Expand departments", "CAC payback <18 months, NRR path >110%", "Poor economics"]] : [["0. Discovery", "0-8 weeks", "Validate buyer pain", "20 interviews, 3 LOIs", "Weak buyer interest"], ["1. MVP", "2-6 months", "Build narrow workflow", "Core integrations live", "Integration blocker"], ["2. Paid pilot", "6-12 months", "Prove adoption", "3 paid pilots, NPS >35", "Low usage"], ["3. Scale", "12-24 months", "Expand GTM", "CAC payback <18 months", "Poor economics"]] }, soWhat: "The roadmap is a decision system, not only a timeline." },
    { title: "17. Strategic Recommendations", actionTitle: "Actions must match the report type", bullets: limit(report.recommendations, dataInsights ? ["Focus the wedge on time-to-insight, not generic dashboards", "Start with one high-value use case", "Build governed KPI library and semantic layer", "Automate data mapping", "Integrate with existing BI/data stack", "Sell business outcomes", "Use paid pilots", "Track adoption and time saved"] : ["Validate buyer pain before scaling", "Use paid pilots as proof", "Control integration scope", "Track unit economics", "Assign risk owners"]), soWhat: "Recommendations must be specific enough for executives to act on." },
    { title: "18. Limitations and Assumptions", actionTitle: "Assumptions must stay aligned with the selected template", table: { head: ["Area", "Assumption / limitation"], rows: [["Template", templateLabel], ["Market sizing", "Directional until source-backed validation with formula, year and confidence"], ["Financial model", "Requires pilot data for ACV, CAC, margin, churn, NRR and payback"], ["Risk", "Must be refreshed after discovery and paid pilot results"], ["Sources", "Weak sources must not drive the final score"]] }, soWhat: "A credible report is clear about what is known, assumed and still unproven." },
    { title: "19. Source Notes", actionTitle: "Sources should be ranked by quality", table: { head: ["Quality", "Source", "Title", "Takeaway"], rows: sourceRows(report, td) }, soWhat: "Source quality matters. Primary and expert sources should carry more weight than generic market summaries." },
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
      y = flow(pdf, y, templateData(templateLabel).workflow, title, id, section.title, isDataInsights(templateLabel) ? "Data insight workflow" : "Workflow diagram");
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
