import { describe, expect, it } from "vitest";
import {
  validateFinancialModel,
  validateFundingShares,
  validateMarketSizing,
  validateScenarioProbabilities,
} from "../../../supabase/functions/_shared/analysis/financial";
import { makeReport } from "../fixtures/canonicalReport";

describe("financial consistency", () => {
  it("accepts internally consistent CapEx, OpEx, currency, funding, probabilities, and market sizing", () => {
    const result = validateFinancialModel(makeReport());
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.normalized.capEx.lowItemSum).toBe(300_000);
    expect(result.normalized.capEx.highItemSum).toBe(500_000);
    expect(result.normalized.capEx.midpoint).toBe(400_000);
  });

  it("rejects an unbounded break-even horizon", () => {
    const report = makeReport();
    report.financials.breakEvenSummary = "24000000 months";
    const result = validateFinancialModel(report);
    expect(result.warnings.map((warning) => warning.code)).toContain("break_even_invalid");
  });

  it("detects CapEx item/total and midpoint mismatches", () => {
    const report = makeReport();
    report.financials.capExTotal = { low: 250_000, high: 600_000, mid: 500_000 };
    const codes = validateFinancialModel(report).warnings.map((warning) => warning.code);
    expect(codes).toEqual(expect.arrayContaining([
      "capex_low_total_mismatch",
      "capex_high_total_mismatch",
      "capex_midpoint_mismatch",
    ]));
  });

  it("detects monthly/annual OpEx mismatches", () => {
    const report = makeReport();
    report.financials.opEx[0].annual = 100_000;
    expect(validateFinancialModel(report).warnings.map((warning) => warning.code))
      .toContain("opex_annual_mismatch");
  });

  it("validates funding shares", () => {
    expect(validateFundingShares(["40%", "60%"]).valid).toBe(true);
    expect(validateFundingShares(["40%", "50%"]).valid).toBe(false);
    expect(validateFundingShares(["40%", "invalid"]).valid).toBe(false);
    expect(validateFundingShares(["-10%", "110%"]).valid).toBe(false);
  });

  it("validates scenario probabilities", () => {
    expect(validateScenarioProbabilities(["25%", "55%", "20%"]).valid).toBe(true);
    expect(validateScenarioProbabilities(["25%", "55%", "30%"]).valid).toBe(false);
    expect(validateScenarioProbabilities(["-5%", "85%", "20%"]).valid).toBe(false);
  });

  it("validates TAM >= SAM >= SOM with normalized units", () => {
    expect(validateMarketSizing("SAR 2.1B", "SAR 180M", "SAR 12M").valid).toBe(true);
    const invalid = validateMarketSizing("SAR 12M", "SAR 180M", "SAR 2.1B");
    expect(invalid.valid).toBe(false);
    expect(invalid.code).toBe("market_size_order_invalid");
  });

  it("rejects negative figures and mixed report currencies", () => {
    const report = makeReport();
    report.financials.capEx[0].low = -1;
    report.financials.scenarios[0].annualRevenue = "SAR 1M";
    const codes = validateFinancialModel(report).warnings.map((warning) => warning.code);
    expect(codes).toContain("negative_financial_value");
    expect(codes).toContain("currency_mismatch");
  });

  it("rejects inverted ranges, unsupported currencies, and negative scenario or funding outcomes", () => {
    const report = makeReport();
    report.financials.currency = "XYZ";
    report.financials.capEx[0] = { ...report.financials.capEx[0], low: 350_000, high: 200_000 };
    report.financials.scenarios[0].annualRevenue = "USD -1M";
    report.fundingMix[0].amount = "USD -200K";
    const codes = validateFinancialModel(report).warnings.map((warning) => warning.code);

    expect(codes).toEqual(expect.arrayContaining([
      "capex_range_invalid",
      "unsupported_currency",
      "negative_financial_value",
    ]));
  });

  it("checks currencies on internal-project outcome fields", () => {
    const report = makeReport();
    report.market.currency = "SAR";
    report.market.tamValue = "SAR 2.1B";
    report.market.samValue = "SAR 180M";
    report.market.somValue = "SAR 12M";
    report.financials.investmentRange = "SAR 480K–680K";
    report.financials.scenarios.forEach((scenario) => {
      if (scenario.annualRevenue) scenario.annualRevenue = scenario.annualRevenue.replace("USD", "SAR");
    });
    report.fundingMix.forEach((source) => { source.amount = source.amount.replace("USD", "SAR"); });
    delete report.financials.scenarios[0].annualRevenue;
    report.financials.scenarios[0].annualFinancialBenefit = 1_000_000;
    report.financials.scenarios[0].annualValueDisplay = "USD 1M";
    report.financials.currency = "SAR";
    expect(validateFinancialModel(report).warnings.map((warning) => warning.code))
      .toContain("currency_mismatch");
  });
});
