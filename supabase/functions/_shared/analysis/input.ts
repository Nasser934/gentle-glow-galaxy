import { parseUnitAwareNumber } from "./numbers.ts";
import { isBlockedHostname, isPrivateNetworkAddress } from "./research.ts";

export const INPUT_KEYS = [
  "projectName", "industry", "location", "description", "strategicObjectives",
  "businessModel", "revenueModel", "founderExperience", "budgetRange", "timeline",
  "teamSize", "dependencies", "assumptions", "constraints", "successFactors",
  "knownRisks", "regulatoryConsiderations", "technologyReadiness", "competitorUrls",
] as const;

type InputKey = typeof INPUT_KEYS[number];
export type ConceptInputRecord = Record<InputKey, string>;

const INDUSTRIES = new Set([
  "Information Technology", "Telecommunications", "Infrastructure & Construction",
  "Government & Public Sector", "Real Estate & Property", "Healthcare & Life Sciences",
  "Financial Services", "Energy & Utilities", "Manufacturing", "Food & Beverage",
  "Retail & E-commerce", "Education", "Other",
]);
const BUDGETS = new Set(["< $50,000", "$50,000 – $250,000", "$250,000 – $1M", "$1M – $5M", "$5M – $25M", "> $25M"]);
const TIMELINES = new Set(["< 3 months", "3 – 6 months", "6 – 12 months", "1 – 2 years", "2 – 5 years", "> 5 years"]);
const TEAM_SIZES = new Set(["1 – 5", "6 – 15", "16 – 50", "51 – 100", "> 100"]);
const TECHNOLOGY_READINESS = new Set(["Proven / Mature", "Established / Widely Used", "Emerging / Early Adoption", "Experimental / R&D Phase", "Unknown / Not Yet Assessed"]);
const BUSINESS_MODELS = new Set([
  "Internal Platform / Cost Avoidance", "SaaS / Subscription Software", "Marketplace / Platform",
  "Hardware / Devices", "Professional Services", "Consumer Product (D2C)", "Wholesale / Distribution",
  "Infrastructure / Capex Project", "Government Contract / PPP", "Other",
]);
const REVENUE_MODELS = new Set([
  "Cost avoidance / productivity benefit", "Recurring subscription", "Transaction / commission fee",
  "License / one-time sale", "Usage-based metering", "Advertising", "Project / milestone billing",
  "Tariff / regulated revenue", "Mixed",
]);

export interface InputIssue {
  code: string;
  field?: string;
  message: string;
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

function normalizeUrl(raw: string): { value?: string; issue?: InputIssue } {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol)) return { issue: { code: "invalid_url_scheme", field: "competitorUrls", message: "Competitor URLs must use HTTP or HTTPS." } };
    if (url.username || url.password) return { issue: { code: "url_credentials_not_allowed", field: "competitorUrls", message: "URL credentials are not allowed." } };
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isIpLiteral = hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    if (isBlockedHostname(hostname) || (isIpLiteral && isPrivateNetworkAddress(hostname))) {
      return { issue: { code: "private_url_not_allowed", field: "competitorUrls", message: "Private and internal network URLs are not allowed." } };
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    else url.pathname = "";
    return { value: url.toString().replace(/\/$/, "") };
  } catch {
    return { issue: { code: "invalid_url", field: "competitorUrls", message: "Competitor URL is invalid." } };
  }
}

export function validateConceptInputs(raw: unknown):
  | { success: true; data: Omit<ConceptInputRecord, "competitorUrls"> & { competitorUrls: string[] }; classification: "complete" | "thin"; issues: InputIssue[] }
  | { success: false; issues: InputIssue[] } {
  const input = asObject(raw);
  if (!input) return { success: false, issues: [{ code: "invalid_payload", message: "Inputs must be an object." }] };
  const issues: InputIssue[] = [];
  const warnings: InputIssue[] = [];
  const unsupported = Object.keys(input).filter((key) => !INPUT_KEYS.includes(key as InputKey));
  for (const field of unsupported) issues.push({ code: "unsupported_field", field, message: `Unsupported field: ${field}` });

  let serializedLength = 0;
  try { serializedLength = JSON.stringify(input).length; } catch { serializedLength = Number.POSITIVE_INFINITY; }
  if (serializedLength > 60_000) issues.push({ code: "payload_too_large", message: "Concept brief is too large." });

  const values = {} as ConceptInputRecord;
  for (const key of INPUT_KEYS) {
    if (key === "competitorUrls") continue;
    const value = input[key];
    if (value === undefined) {
      values[key] = "";
      continue;
    }
    if (typeof value !== "string") {
      issues.push({ code: "invalid_field_type", field: key, message: `${key} must be text.` });
      values[key] = "";
      continue;
    }
    const trimmed = value.trim();
    const maxLength = key === "description" ? 8_000 : 6_000;
    if (trimmed.length > maxLength) issues.push({ code: "field_too_long", field: key, message: `${key} is too long.` });
    values[key] = trimmed;
  }

  if (values.projectName.length < 2) issues.push({ code: "required_field", field: "projectName", message: "Project name is required." });
  if (!INDUSTRIES.has(values.industry)) issues.push({ code: "invalid_enum", field: "industry", message: "Select a supported industry." });
  if (values.description.length < 20) issues.push({ code: "thin_description", field: "description", message: "Project description needs more detail." });
  const parsedBudget = parseUnitAwareNumber(values.budgetRange);
  if (!BUDGETS.has(values.budgetRange) && (!parsedBudget.valid || parsedBudget.value === null || parsedBudget.value < 0 || parsedBudget.unit !== "money")) {
    issues.push({ code: "invalid_budget", field: "budgetRange", message: "Enter a valid non-negative budget range with a supported currency or scale." });
  }
  if (!TIMELINES.has(values.timeline)) issues.push({ code: "invalid_enum", field: "timeline", message: "Select a supported timeline." });
  if (values.teamSize && !TEAM_SIZES.has(values.teamSize)) issues.push({ code: "invalid_enum", field: "teamSize", message: "Select a supported team size." });
  if (values.technologyReadiness && !TECHNOLOGY_READINESS.has(values.technologyReadiness)) issues.push({ code: "invalid_enum", field: "technologyReadiness", message: "Select a supported technology readiness level." });
  if (values.businessModel && !BUSINESS_MODELS.has(values.businessModel)) issues.push({ code: "invalid_enum", field: "businessModel", message: "Select a supported business model." });
  if (values.revenueModel && !REVENUE_MODELS.has(values.revenueModel)) issues.push({ code: "invalid_enum", field: "revenueModel", message: "Select a supported value or revenue model." });

  const internalModel = values.businessModel === "Internal Platform / Cost Avoidance";
  const internalValue = values.revenueModel === "Cost avoidance / productivity benefit";
  if (internalModel !== internalValue && values.businessModel && values.revenueModel) {
    warnings.push({ code: "business_model_conflict", field: "revenueModel", message: "The business model and financial value model should both be internal or both be commercial." });
  }
  if (values.businessModel === "Infrastructure / Capex Project" && ["< 3 months", "3 – 6 months"].includes(values.timeline)) {
    warnings.push({ code: "infrastructure_timeline_risk", field: "timeline", message: "The selected timeline may be too short for an infrastructure project." });
  }
  if (values.businessModel === "Infrastructure / Capex Project" && values.teamSize === "1 – 5") {
    warnings.push({ code: "infrastructure_team_size_risk", field: "teamSize", message: "The selected team may be too small for an infrastructure project." });
  }
  const currencyText = [values.budgetRange, values.assumptions, values.description].join(" ");
  const currencies = new Set((currencyText.match(/\b(?:SAR|USD|AED|EUR|GBP)\b/gi) ?? []).map((value) => value.toUpperCase()));
  if (currencies.size > 1) {
    warnings.push({ code: "currency_conflict", field: "budgetRange", message: "The brief contains multiple currencies; clarify the authoritative report currency." });
  }

  const urlInput = input.competitorUrls;
  const rawUrls = Array.isArray(urlInput)
    ? urlInput.map(String)
    : typeof urlInput === "string"
      ? urlInput.split(/[\n,\s]+/)
      : [];
  if (urlInput !== undefined && typeof urlInput !== "string" && !Array.isArray(urlInput)) {
    issues.push({ code: "invalid_field_type", field: "competitorUrls", message: "Competitor URLs must be text or a list." });
  }
  if (rawUrls.filter(Boolean).length > 10) issues.push({ code: "too_many_urls", field: "competitorUrls", message: "Use no more than ten competitor URLs." });
  const competitorUrls: string[] = [];
  const seen = new Set<string>();
  for (const rawUrl of rawUrls.map((value) => value.trim()).filter(Boolean)) {
    const normalized = normalizeUrl(rawUrl);
    if (normalized.issue) {
      issues.push(normalized.issue);
      continue;
    }
    const value = normalized.value ?? "";
    const key = value.toLowerCase();
    if (seen.has(key)) issues.push({ code: "duplicate_url", field: "competitorUrls", message: "Duplicate competitor URL." });
    else {
      seen.add(key);
      competitorUrls.push(value);
    }
  }

  if (issues.length > 0) return { success: false, issues };
  const optionalQualityFields: InputKey[] = [
    "strategicObjectives", "businessModel", "revenueModel", "founderExperience", "assumptions",
    "knownRisks", "regulatoryConsiderations", "successFactors", "dependencies",
  ];
  const completedOptional = optionalQualityFields.filter((key) => values[key].split(/\s+/).filter(Boolean).length >= 3).length;
  const classification = completedOptional >= 6 && warnings.length === 0 ? "complete" : "thin";
  return {
    success: true,
    data: { ...values, competitorUrls },
    classification,
    issues: warnings,
  };
}

export type FieldOrigin = "user_input" | "ai_suggestion" | "accepted_ai_suggestion" | "edited_after_ai_suggestion";

export function validateInputOrigins(raw: unknown): Partial<Record<InputKey, FieldOrigin>> {
  const input = asObject(raw);
  if (!input) return {};
  const allowed = new Set<FieldOrigin>(["user_input", "ai_suggestion", "accepted_ai_suggestion", "edited_after_ai_suggestion"]);
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) =>
    INPUT_KEYS.includes(key as InputKey) && allowed.has(value as FieldOrigin)
      ? [[key, value as FieldOrigin]]
      : [],
  )) as Partial<Record<InputKey, FieldOrigin>>;
}

export function mergeAcceptedAiSuggestions<T extends ConceptInputRecord>(
  current: T,
  suggestions: Partial<T>,
  acceptedKeys: InputKey[],
): { inputs: T; origins: Partial<Record<InputKey, FieldOrigin>> } {
  const inputs = { ...current };
  const origins: Partial<Record<InputKey, FieldOrigin>> = {};
  for (const key of INPUT_KEYS) if (current[key]?.trim()) origins[key] = "user_input";
  for (const key of acceptedKeys) {
    const suggestion = suggestions[key];
    if (typeof suggestion === "string" && suggestion.trim()) {
      inputs[key] = suggestion.trim() as T[InputKey];
      origins[key] = "accepted_ai_suggestion";
    }
  }
  return { inputs, origins };
}
