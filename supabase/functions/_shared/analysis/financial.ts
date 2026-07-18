import { numericRange, parseUnitAwareNumber, type CurrencyCode } from "./numbers.ts";

export type FigureValidationStatus =
  | "Verified from user input"
  | "Supported by cited source"
  | "Calculated"
  | "AI estimate"
  | "Requires validation";

export interface FinancialWarning {
  code: string;
  message: string;
  path?: string;
}

interface FinancialReportLike {
  market?: { tamValue?: unknown; samValue?: unknown; somValue?: unknown; currency?: unknown };
  financials?: {
    currency?: unknown;
    capExTotal?: { low?: unknown; high?: unknown; mid?: unknown };
    capEx?: Array<{ low?: unknown; high?: unknown }>;
    opEx?: Array<{ monthly?: unknown; annual?: unknown }>;
    scenarios?: Array<{
      probability?: unknown;
      annualRevenue?: unknown;
      annualFinancialBenefit?: unknown;
      annualValueDisplay?: unknown;
    }>;
    investmentRange?: unknown;
    breakEvenSummary?: unknown;
  };
  fundingMix?: Array<{ share?: unknown; amount?: unknown }>;
}

const TOLERANCE = 0.01;

function finite(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function approximatelyEqual(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= Math.max(1, Math.abs(expected) * TOLERANCE);
}

function percentTotal(values: unknown[]) {
  const parsed = values.map((value) => parseUnitAwareNumber(value));
  if (parsed.length === 0 || parsed.some((value) =>
    !value.valid
    || value.unit !== "percent"
    || value.value === null
    || value.value < 0
    || value.value > 100
  )) {
    return { valid: false, total: null };
  }
  const total = parsed.reduce((sum, value) => sum + (value.value ?? 0), 0);
  return { valid: Math.abs(total - 100) <= 0.01, total };
}

export function validateFundingShares(values: unknown[]) {
  return percentTotal(values);
}

export function validateScenarioProbabilities(values: unknown[]) {
  return percentTotal(values);
}

export function validateMarketSizing(tamRaw: unknown, samRaw: unknown, somRaw: unknown) {
  const tam = parseUnitAwareNumber(tamRaw);
  const sam = parseUnitAwareNumber(samRaw);
  const som = parseUnitAwareNumber(somRaw);
  if (![tam, sam, som].every((value) => value.valid && value.value !== null && (value.value ?? -1) >= 0)) {
    return { valid: false, code: "market_size_invalid", values: { tam, sam, som } };
  }
  const valid = (tam.value ?? 0) >= (sam.value ?? 0) && (sam.value ?? 0) >= (som.value ?? 0);
  return { valid, code: valid ? null : "market_size_order_invalid", values: { tam, sam, som } };
}

function collectCurrencies(report: FinancialReportLike): CurrencyCode[] {
  const values: unknown[] = [
    report.market?.tamValue,
    report.market?.samValue,
    report.market?.somValue,
    report.financials?.investmentRange,
    ...(report.financials?.scenarios?.flatMap((scenario) => [
      scenario.annualRevenue,
      scenario.annualFinancialBenefit,
      scenario.annualValueDisplay,
    ]) ?? []),
    ...(report.fundingMix?.map((source) => source.amount) ?? []),
  ];
  return values
    .map((value) => parseUnitAwareNumber(value).currency)
    .filter((currency): currency is CurrencyCode => currency !== null);
}

export function validateFinancialModel(report: FinancialReportLike) {
  const warnings: FinancialWarning[] = [];
  const financials = report.financials ?? {};
  const capExItems = financials.capEx ?? [];
  const lowItemSum = capExItems.reduce((sum, item) => sum + (finite(item.low) ?? 0), 0);
  const highItemSum = capExItems.reduce((sum, item) => sum + (finite(item.high) ?? 0), 0);
  const lowTotal = finite(financials.capExTotal?.low) ?? 0;
  const highTotal = finite(financials.capExTotal?.high) ?? 0;
  const midpoint = (lowTotal + highTotal) / 2;
  const declaredMidpoint = finite(financials.capExTotal?.mid) ?? 0;

  if (!approximatelyEqual(lowItemSum, lowTotal)) warnings.push({ code: "capex_low_total_mismatch", message: "CapEx low items do not match the declared low total.", path: "financials.capExTotal.low" });
  if (!approximatelyEqual(highItemSum, highTotal)) warnings.push({ code: "capex_high_total_mismatch", message: "CapEx high items do not match the declared high total.", path: "financials.capExTotal.high" });
  if (!approximatelyEqual(declaredMidpoint, midpoint)) warnings.push({ code: "capex_midpoint_mismatch", message: "CapEx midpoint does not equal the low/high midpoint.", path: "financials.capExTotal.mid" });
  if (lowTotal > highTotal || capExItems.some((item) => {
    const low = finite(item.low);
    const high = finite(item.high);
    return low !== null && high !== null && low > high;
  })) {
    warnings.push({ code: "capex_range_invalid", message: "CapEx low values must not exceed high values.", path: "financials.capEx" });
  }

  for (const [index, item] of (financials.opEx ?? []).entries()) {
    const monthly = finite(item.monthly);
    const annual = finite(item.annual);
    if (monthly === null || annual === null || !approximatelyEqual(annual, monthly * 12)) {
      warnings.push({ code: "opex_annual_mismatch", message: "Annual OpEx must equal monthly OpEx multiplied by 12.", path: `financials.opEx.${index}` });
    }
  }

  const funding = validateFundingShares((report.fundingMix ?? []).map((source) => source.share));
  if (!funding.valid) warnings.push({ code: "funding_share_total_invalid", message: "Funding shares must total 100%.", path: "fundingMix" });
  const probabilities = validateScenarioProbabilities((financials.scenarios ?? []).map((scenario) => scenario.probability));
  if (!probabilities.valid) warnings.push({ code: "scenario_probability_total_invalid", message: "Scenario probabilities must total 100%.", path: "financials.scenarios" });

  const market = validateMarketSizing(report.market?.tamValue, report.market?.samValue, report.market?.somValue);
  if (!market.valid) warnings.push({ code: market.code ?? "market_size_invalid", message: "Market sizing must be non-negative and follow TAM ≥ SAM ≥ SOM.", path: "market" });

  const numericValues = [
    lowTotal,
    highTotal,
    declaredMidpoint,
    ...capExItems.flatMap((item) => [finite(item.low), finite(item.high)]),
    ...(financials.opEx ?? []).flatMap((item) => [finite(item.monthly), finite(item.annual)]),
  ].filter((value): value is number => value !== null);
  const parsedFinancialValues = [
    financials.investmentRange,
    ...(financials.scenarios ?? []).map((scenario) =>
      scenario.annualFinancialBenefit ?? scenario.annualRevenue ?? scenario.annualValueDisplay),
    ...(report.fundingMix ?? []).map((source) => source.amount),
  ].map((value) => parseUnitAwareNumber(value));
  if (
    numericValues.some((value) => value < 0)
    || parsedFinancialValues.some((value) => value.valid && [value.value, value.low, value.high].some((number) => number !== null && number < 0))
  ) {
    warnings.push({ code: "negative_financial_value", message: "Financial values must not be negative.", path: "financials" });
  }

  for (const [index, scenario] of (financials.scenarios ?? []).entries()) {
    const outcome = scenario.annualFinancialBenefit ?? scenario.annualRevenue ?? scenario.annualValueDisplay;
    const parsed = parseUnitAwareNumber(outcome);
    if (!parsed.valid || parsed.value === null || parsed.value < 0) {
      warnings.push({ code: "scenario_outcome_invalid", message: "Each scenario needs a valid non-negative financial outcome or an explicit validation status.", path: `financials.scenarios.${index}` });
    }
  }

  const declaredCurrency = typeof financials.currency === "string" ? financials.currency.toUpperCase() : "";
  const marketCurrency = typeof report.market?.currency === "string" ? report.market.currency.toUpperCase() : "";
  const supportedCurrencies = new Set(["SAR", "USD", "AED", "EUR", "GBP"]);
  if ((declaredCurrency && !supportedCurrencies.has(declaredCurrency)) || (marketCurrency && !supportedCurrencies.has(marketCurrency))) {
    warnings.push({ code: "unsupported_currency", message: "Use a supported report currency: SAR, USD, AED, EUR, or GBP.", path: "financials.currency" });
  }
  const currencies = new Set(collectCurrencies(report));
  if (supportedCurrencies.has(declaredCurrency)) currencies.add(declaredCurrency as CurrencyCode);
  if (supportedCurrencies.has(marketCurrency)) currencies.add(marketCurrency as CurrencyCode);
  if (currencies.size > 1) warnings.push({ code: "currency_mismatch", message: "All major report figures must use the same currency.", path: "financials.currency" });

  const investmentRange = numericRange(financials.investmentRange);
  const monthlyOpEx = (financials.opEx ?? []).reduce((sum, item) => sum + (finite(item.monthly) ?? 0), 0);
  const expectedLow = lowTotal + monthlyOpEx * 6;
  const expectedHigh = highTotal + monthlyOpEx * 6;
  if (!investmentRange || !approximatelyEqual(investmentRange.low, expectedLow) || !approximatelyEqual(investmentRange.high, expectedHigh)) {
    warnings.push({ code: "investment_range_inconsistent", message: "Investment range must align with CapEx and six months of operating runway.", path: "financials.investmentRange" });
  }

  const breakEven = parseUnitAwareNumber(financials.breakEvenSummary);
  if (!breakEven.valid || breakEven.unit !== "month" || breakEven.value === null || breakEven.value < 0) {
    warnings.push({ code: "break_even_invalid", message: "Break-even or internal payback must be a valid non-negative month or range.", path: "financials.breakEvenSummary" });
  }

  return {
    valid: warnings.length === 0,
    warnings,
    normalized: {
      capEx: { lowItemSum, highItemSum, midpoint },
      monthlyOpEx,
      annualOpEx: monthlyOpEx * 12,
      fundingShareTotal: funding.total,
      scenarioProbabilityTotal: probabilities.total,
      investmentRange,
      market: market.values,
      currency: declaredCurrency || marketCurrency || null,
    },
  };
}
