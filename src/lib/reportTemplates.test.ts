import { describe, expect, it } from "vitest";
import { detectReportType, validateTemplateIntegrity } from "./reportTemplates";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

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

const baseReport = (summary: string): FeasibilityReport => ({
  reportId: "FSB-TEST",
  dateIssued: "2026-05-05",
  classification: "Confidential",
  preparedBy: "Concept AI",
  methodology: "FMART",
  executiveSummary: summary,
  scores: {
    financial: 7.2,
    market: 8.1,
    achievability: 7.5,
    risk: 6.5,
    timing: 8,
    operational: 7,
    overall: 7.4,
    verdict: "PROCEED WITH CAUTION",
    financialFinding: "",
    marketFinding: "",
    achievabilityFinding: "",
    riskFinding: "",
    timingFinding: "",
    operationalFinding: "",
  },
  market: {
    tamLabel: "TAM",
    tamValue: "$1B",
    tamCagr: "10%",
    samLabel: "SAM",
    samValue: "$300M",
    samCagr: "10%",
    somLabel: "SOM",
    somValue: "$30M",
    somCagr: "10%",
    growthChart: [],
    currency: "USD",
  },
  customer: { ageLocation: "", income: "", goals: "", willingnessToPay: "", behavior: "" },
  competitors: [],
  financials: { currency: "USD", capExTotal: { low: 1, high: 2, mid: 1.5 }, capEx: [], opEx: [], scenarios: [], investmentRange: "$1M – $5M", breakEvenSummary: "Month 24" },
  risks: [],
  fundingMix: [],
  fundingAdvisory: "",
  recommendations: [],
  nextSteps: [],
});

describe("report template integrity", () => {
  it("uses cloud collaboration / generic SaaS when title says Secure Cloud Collaboration Platform", () => {
    const inputs = baseInputs("Secure Cloud Collaboration Platform", "SaaS / Cloud Collaboration");
    const report = baseReport("Team workspace and collaboration SaaS for remote teams.");
    expect(detectReportType(inputs, report)).toBe("generic_saas");
  });

  it("uses healthcare RPM when title and industry are RPM", () => {
    const inputs = baseInputs("Secure Remote Patient Monitoring Application", "Healthcare & Life Sciences");
    const report = baseReport("HIPAA-compliant RPM platform with EHR integration and reimbursement workflow.");
    expect(detectReportType(inputs, report)).toBe("healthcare_rpm");
  });

  it("uses public-sector data exchange for inter-agency report", () => {
    const inputs = baseInputs("Inter-Agency Secure Data Exchange Platform", "Government & Public Sector");
    const report = baseReport("FedRAMP-ready agency data-sharing platform.");
    expect(detectReportType(inputs, report)).toBe("public_sector_data_exchange");
  });

  it("blocks healthcare terms inside cloud collaboration reports", () => {
    const inputs = { ...baseInputs("Secure Cloud Collaboration Platform", "SaaS / Cloud Collaboration"), assumptions: "HIPAA reimbursement and patient adherence" };
    const result = validateTemplateIntegrity(inputs, baseReport("Collaboration SaaS."));
    expect(result.reportType).toBe("generic_saas");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("blocks public-sector terms inside RPM reports", () => {
    const inputs = { ...baseInputs("Secure Remote Patient Monitoring Application", "Healthcare & Life Sciences"), assumptions: "inter-agency data exchange and justice-to-health workflow" };
    const result = validateTemplateIntegrity(inputs, baseReport("HIPAA RPM platform."));
    expect(result.reportType).toBe("healthcare_rpm");
    expect(result.hasBlockingIssues).toBe(true);
  });

  it("allows clean RPM report", () => {
    const inputs = { ...baseInputs("Secure Remote Patient Monitoring Application", "Healthcare & Life Sciences"), assumptions: "HIPAA, EHR integration, device data reliability and reimbursement validation" };
    const report = baseReport("HIPAA-compliant remote patient monitoring platform with EHR integration.");
    report.competitors = [{ name: "Medtronic", model: "RPM", weakness: "device lock-in", edge: "vendor-neutral workflow" }];
    report.research = { overview: "RPM", confidence: "High", sentiment: "Positive", keySignals: [], painPoints: [], competitorMentions: [], redditSignals: [], webSignals: [], citations: [{ source: "CMS", title: "RPM reimbursement", url: "https://cms.gov", takeaway: "RPM billing guidance" }] };
    const result = validateTemplateIntegrity(inputs, report);
    expect(result.reportType).toBe("healthcare_rpm");
    expect(result.hasBlockingIssues).toBe(false);
  });
});
