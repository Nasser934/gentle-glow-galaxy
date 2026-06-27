// =============================================================================
// Phase 2.1 — Project-type helper
// -----------------------------------------------------------------------------
// Detects whether a project is "internal" (efficiency / cost-saving platform)
// vs "commercial" (external revenue / SaaS / consumer). Drives label sets so
// PDF text doesn't push SaaS terminology onto internal-platform reports.
// =============================================================================

import type { ConceptInputs } from "@/types/analysis";

export function isInternalProject(inputs: ConceptInputs): boolean {
  const blob = [
    inputs.businessModel, inputs.revenueModel, inputs.description,
    inputs.strategicObjectives, inputs.industry,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\binternal\b/.test(blob)) return true;
  if (/\b(cost\s+saving|cost\s+avoidance|efficienc|automation|in[- ]house)\b/.test(blob)
      && !/\brevenue\b|\bcustomer(s)?\b|\bsubscriber/.test(blob)) return true;
  // No commercial revenue signal at all
  const hasRevenueSignal = /\b(subscription|saas|transaction|marketplace|license|advertis|b2c|b2b|consumer|customer|ARR|MRR|pricing)\b/i.test(blob);
  if (!hasRevenueSignal && /\b(department|stakeholder|employee|workflow|process)\b/.test(blob)) return true;
  return false;
}

export interface ProjectLabels {
  isInternal: boolean;
  /** What "revenue" is called for this project. */
  revenueWord: string;        // "Revenue" vs "Annual savings"
  customerWord: string;       // "Customers" vs "Departments"
  customersYr1Label: string;
  annualRevenueLabel: string;
  fourthKpiLabel: string;     // 4th cover KPI label
  // For Money-logic copy
  baseCaseTemplate: (revenue: string, customers: string) => string;
}

export function projectLabels(inputs: ConceptInputs): ProjectLabels {
  const internal = isInternalProject(inputs);
  if (internal) {
    return {
      isInternal: true,
      revenueWord: "Annual savings",
      customerWord: "Departments",
      customersYr1Label: "Year-1 adoption",
      annualRevenueLabel: "Annual savings",
      fourthKpiLabel: "Payback",
      baseCaseTemplate: (rev, cust) =>
        `Base case: ${rev} annual savings at ${cust} Year-1 adoption.`,
    };
  }
  return {
    isInternal: false,
    revenueWord: "Revenue",
    customerWord: "Customers",
    customersYr1Label: "Customers / Yr 1",
    annualRevenueLabel: "Annual revenue",
    fourthKpiLabel: "LTV : CAC",
    baseCaseTemplate: (rev, cust) =>
      `Base case: ${rev} revenue with ${cust} customers in Year 1.`,
  };
}
