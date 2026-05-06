import { describe, expect, it } from "vitest";
import { detectReportType, validateTemplateIntegrity } from "./reportTemplates";
import { generateLocalReport } from "./localReport";
import type { ConceptInputs } from "@/types/analysis";

const baseInputs = (projectName: string, industry: string): ConceptInputs => ({
  projectName,
  industry,
  location: "USA",
  description: "",
  strategicObjectives: "",
  businessModel: "SaaS / Subscription Software",
  revenueModel: "Recurring subscription",
  founderExperience: "",
  budgetRange: "$1M – $5M",
  timeline: "6 – 12 months",
  teamSize: "6 – 15",
  dependencies: "",
  assumptions: "",
  constraints: "",
  successFactors: "",
  knownRisks: "",
  regulatoryConsiderations: "",
  technologyReadiness: "Established / Widely Used",
  competitorUrls: "",
});

const allText = (value: unknown) => JSON.stringify(value).toLowerCase();

describe("report template integrity", () => {
  it("uses customer data platform template for Unified Customer Profile Platform", () => {
    const inputs = {
      ...baseInputs("Unified Customer Profile Platform", "Information Technology"),
      description: "A customer data platform CDP for unified customer profile, customer 360, identity resolution, first-party data, segmentation, activation, consent management, CRM, email platform, support platform, billing system, retention, churn, LTV and personalization.",
    };
    const report = generateLocalReport(inputs);
    const result = validateTemplateIntegrity(inputs, report);
    const text = allText(report);

    expect(detectReportType(inputs, report)).toBe("customer_data_platform");
    expect(result.reportType).toBe("customer_data_platform");
    expect(result.hasBlockingIssues).toBe(false);
    expect(text).toContain("twilio segment");
    expect(text).toContain("salesforce data cloud");
    expect(text).toContain("adobe real-time cdp");
    expect(text).toContain("identity resolution");
    expect(text).toContain("consent");
    expect(text).not.toContain("cloud collaboration saas");
    expect(text).not.toContain("microsoft teams");
    expect(text).not.toContain("slack");
    expect(text).not.toContain("notion");
    expect(text).not.toContain("asana");
    expect(text).not.toContain("remote patient monitoring");
    expect(text).not.toContain("inter-agency");
  });

  it("uses enterprise data insights template for BI analytics reports", () => {
    const inputs = {
      ...baseInputs("Enterprise Data Insights Platform", "Information Technology"),
      description: "A business intelligence and enterprise analytics platform for governed KPIs, semantic layer, data ingestion, ERP, CRM, real-time insights and time-to-insight improvement.",
    };
    const report = generateLocalReport(inputs);
    const result = validateTemplateIntegrity(inputs, report);
    const text = allText(report);

    expect(detectReportType(inputs, report)).toBe("enterprise_data_insights");
    expect(result.reportType).toBe("enterprise_data_insights");
    expect(result.hasBlockingIssues).toBe(false);
    expect(text).toContain("power bi");
    expect(text).toContain("tableau");
    expect(text).toContain("looker");
    expect(text).toContain("semantic layer");
    expect(text).toContain("time-to-insight");
    expect(text).not.toContain("cloud collaboration saas");
    expect(text).not.toContain("slack");
    expect(text).not.toContain("notion");
    expect(text).not.toContain("asana");
    expect(text).not.toContain("microsoft teams");
    expect(text).not.toContain("remote patient monitoring");
    expect(text).not.toContain("inter-agency");
  });

  it("uses cloud collaboration / generic SaaS when title says Secure Cloud Collaboration Platform", () => {
    const inputs = {
      ...baseInputs("Secure Cloud Collaboration Platform", "SaaS / Cloud Collaboration"),
      description: "Team workspace and collaboration SaaS for remote teams, workflow, shared knowledge and productivity.",
    };
    const report = generateLocalReport(inputs);
    expect(detectReportType(inputs, report)).toBe("generic_saas");
  });

  it("uses healthcare RPM when title and industry are RPM", () => {
    const inputs = {
      ...baseInputs("Secure Remote Patient Monitoring Application", "Healthcare & Life Sciences"),
      description: "HIPAA-compliant RPM platform with remote patient monitoring, EHR integration, device data, reimbursement and clinician workflow.",
    };
    const report = generateLocalReport(inputs);
    expect(detectReportType(inputs, report)).toBe("healthcare_rpm");
  });

  it("uses public-sector data exchange for inter-agency report", () => {
    const inputs = {
      ...baseInputs("Inter-Agency Secure Data Exchange Platform", "Government & Public Sector"),
      description: "FedRAMP-ready public-sector agency data-sharing platform for inter-agency secure data exchange, procurement and auditability.",
    };
    const report = generateLocalReport(inputs);
    expect(detectReportType(inputs, report)).toBe("public_sector_data_exchange");
  });

  it("blocks healthcare terms inside cloud collaboration reports", () => {
    const inputs = {
      ...baseInputs("Secure Cloud Collaboration Platform", "SaaS / Cloud Collaboration"),
      description: "Team workspace and collaboration SaaS for remote teams.",
      assumptions: "HIPAA reimbursement and patient adherence",
    };
    const result = validateTemplateIntegrity(inputs, generateLocalReport(inputs));
    expect(result.reportType).toBe("generic_saas");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("blocks public-sector terms inside RPM reports", () => {
    const inputs = {
      ...baseInputs("Secure Remote Patient Monitoring Application", "Healthcare & Life Sciences"),
      description: "HIPAA RPM platform with EHR integration.",
      assumptions: "inter-agency data exchange and justice-to-health workflow",
    };
    const result = validateTemplateIntegrity(inputs, generateLocalReport(inputs));
    expect(result.reportType).toBe("healthcare_rpm");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("blocks cloud collaboration terms inside enterprise data insights reports", () => {
    const inputs = {
      ...baseInputs("Enterprise Data Insights Platform", "Information Technology"),
      description: "A business intelligence analytics platform with semantic layer and governed KPIs.",
      assumptions: "cloud collaboration SaaS with Slack and Notion style team workspace",
    };
    const result = validateTemplateIntegrity(inputs, generateLocalReport(inputs));
    expect(result.reportType).toBe("enterprise_data_insights");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("blocks cloud collaboration terms inside CDP reports", () => {
    const inputs = {
      ...baseInputs("Unified Customer Profile Platform", "Information Technology"),
      description: "A customer data platform for unified customer profile, CDP, customer 360, identity resolution, segmentation and activation.",
      assumptions: "cloud collaboration SaaS with Microsoft Teams and Slack",
    };
    const result = validateTemplateIntegrity(inputs, generateLocalReport(inputs));
    expect(result.reportType).toBe("customer_data_platform");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("blocks export when Source Notes are empty", () => {
    const inputs = {
      ...baseInputs("Unified Customer Profile Platform", "Information Technology"),
      description: "A customer data platform for unified customer profile, CDP, customer 360, identity resolution, segmentation and activation.",
    };
    const report = generateLocalReport(inputs);
    report.research = { ...report.research!, citations: [] };
    const result = validateTemplateIntegrity(inputs, report);
    expect(result.hasBlockingIssues).toBe(true);
    expect(result.issues.some((issue) => issue.field === "sources")).toBe(true);
  });
});
