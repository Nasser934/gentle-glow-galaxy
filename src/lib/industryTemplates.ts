// Phase 8 — Industry-specific templates that pre-fill ConceptInputs
// with sensible scaffolding based on the chosen industry.
import type { ConceptInputs } from "@/types/analysis";

export type IndustryTemplate = {
  industry: string;
  label: string;
  blurb: string;
  defaults: Partial<ConceptInputs>;
};

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    industry: "Information Technology",
    label: "SaaS / IT Product",
    blurb: "Cloud-native software with subscription pricing, fast iteration, and CAC-driven growth.",
    defaults: {
      businessModel: "SaaS / Subscription Software",
      revenueModel: "Recurring subscription",
      timeline: "6 – 12 months",
      teamSize: "6 – 15",
      technologyReadiness: "Established / Widely Used",
      assumptions: "• Product-market fit reachable within 12 months\n• Cloud cost remains <20% of MRR\n• 5–8% monthly net new growth post-launch",
      successFactors: "• Strong PLG motion + sales-assisted upsell\n• <2% monthly logo churn\n• Clear ICP & integration story",
      knownRisks: "• Slow PMF discovery\n• Integration breakage with key SaaS partners\n• AI-driven competitor undercutting",
      regulatoryConsiderations: "GDPR / data residency, SOC 2 Type II for enterprise sales, regional data localization requirements.",
    },
  },
  {
    industry: "Telecommunications",
    label: "Telecom Service / Infrastructure",
    blurb: "Capex-heavy network or value-added telecom service with regulatory and spectrum constraints.",
    defaults: {
      businessModel: "Infrastructure / Capex Project",
      revenueModel: "Usage-based metering",
      timeline: "1 – 2 years",
      teamSize: "16 – 50",
      technologyReadiness: "Proven / Mature",
      assumptions: "• Spectrum / interconnect agreements obtainable on commercial terms\n• 5-year asset life with utilization >55%\n• Wholesale tariffs decline 4–6% annually",
      successFactors: "• Regulatory approvals secured upfront\n• Anchor enterprise customers signed in pilot phase\n• Disciplined capex phasing tied to traffic growth",
      knownRisks: "• Regulatory delays\n• Backhaul / fiber dependency\n• Tariff erosion from MVNO competition",
      regulatoryConsiderations: "Regulator licensing (CITC/TRA equivalent), spectrum allocation, interconnect & MTR rules, lawful intercept compliance.",
    },
  },
  {
    industry: "Infrastructure & Construction",
    label: "Civil / Infrastructure Project",
    blurb: "Design-bid-build or PPP infrastructure project with long timelines and concentrated risk.",
    defaults: {
      businessModel: "Infrastructure / Capex Project",
      revenueModel: "Project / milestone billing",
      timeline: "2 – 5 years",
      teamSize: "51 – 100",
      technologyReadiness: "Proven / Mature",
      assumptions: "• Land/permits secured before financial close\n• Material price swings hedged to ±10%\n• 18–24 month construction window",
      successFactors: "• Tier-1 EPC contractor with PPP track record\n• Lender-friendly bankability package\n• Clear offtake/availability payment structure",
      knownRisks: "• Permitting delays\n• Cost overruns from material inflation\n• Geotechnical / right-of-way surprises",
      regulatoryConsiderations: "Environmental impact assessment, municipal permits, land acquisition law, occupational safety, PPP framework.",
    },
  },
  {
    industry: "Government & Public Sector",
    label: "GovTech / PPP",
    blurb: "Public-sector digital service or PPP — long sales cycle, strict procurement, social ROI.",
    defaults: {
      businessModel: "Government Contract / PPP",
      revenueModel: "Project / milestone billing",
      timeline: "1 – 2 years",
      teamSize: "16 – 50",
      technologyReadiness: "Established / Widely Used",
      assumptions: "• Award via competitive RFP within 9–12 months\n• Adoption tied to mandated rollout\n• Multi-year framework agreement available",
      successFactors: "• Local content / Saudization or equivalent\n• Demonstrated security accreditation\n• Prime-contractor or trusted SI partner",
      knownRisks: "• Procurement cancellation or rebid\n• Budget reallocation between fiscal years\n• Slow change management in agencies",
      regulatoryConsiderations: "Government procurement law, data sovereignty, accessibility (WCAG), national security & vetting requirements.",
    },
  },
  {
    industry: "Real Estate & Property",
    label: "Real-estate Development",
    blurb: "Mixed-use, residential or commercial development with absorption and yield analysis.",
    defaults: {
      businessModel: "Infrastructure / Capex Project",
      revenueModel: "Project / milestone billing",
      timeline: "2 – 5 years",
      teamSize: "16 – 50",
      technologyReadiness: "Proven / Mature",
      assumptions: "• Land basis fixed at term-sheet price\n• 18-month absorption to 80% occupancy\n• Cap rate 7–8.5% on stabilized NOI",
      successFactors: "• Master plan approval & utilities readiness\n• Anchor tenants pre-leased\n• Construction debt at <250 bps over benchmark",
      knownRisks: "• Slow absorption / rent compression\n• Construction cost inflation\n• Interest rate / refinancing risk",
      regulatoryConsiderations: "Zoning, building code, environmental, escrow law, REIT/foreign-ownership rules.",
    },
  },
  {
    industry: "Healthcare & Life Sciences",
    label: "Healthcare Service / Device",
    blurb: "Clinical service line, digital health, or regulated device with payer & approval risk.",
    defaults: {
      businessModel: "Professional Services",
      revenueModel: "Mixed",
      timeline: "1 – 2 years",
      teamSize: "16 – 50",
      technologyReadiness: "Established / Widely Used",
      assumptions: "• Reimbursement code or self-pay path identified\n• 12–18 month regulatory clearance\n• Clinician productivity ramps to 80% in 6 months",
      successFactors: "• Clear clinical evidence package\n• Insurer / payer partnerships\n• Compliant data handling (PHI)",
      knownRisks: "• Regulatory delay (CE/FDA/SFDA)\n• Adverse event / liability exposure\n• Slow payer adoption",
      regulatoryConsiderations: "HIPAA / PDPL / GDPR, medical device regulation (MDR/FDA/SFDA), clinical ethics approvals.",
    },
  },
];

export function findTemplate(industry: string): IndustryTemplate | undefined {
  return INDUSTRY_TEMPLATES.find((t) => t.industry === industry);
}

/** Merge template defaults into existing inputs, only filling blank fields. */
export function applyTemplate(current: ConceptInputs, tpl: IndustryTemplate): ConceptInputs {
  const merged: ConceptInputs = { ...current, industry: tpl.industry };
  for (const [k, v] of Object.entries(tpl.defaults)) {
    const key = k as keyof ConceptInputs;
    if (!merged[key] || merged[key].trim() === "") {
      merged[key] = v as string;
    }
  }
  return merged;
}
