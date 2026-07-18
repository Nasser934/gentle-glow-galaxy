import { describe, expect, it } from "vitest";
import { parseUnitAwareNumber } from "../../../supabase/functions/_shared/analysis/numbers";

describe("unit-aware numeric parsing", () => {
  it.each([
    ["SAR 12M", 12_000_000, "SAR", null, null, "money"],
    ["SAR 12.5M", 12_500_000, "SAR", null, null, "money"],
    ["$2.1B", 2_100_000_000, "USD", null, null, "money"],
    ["8%", 8, null, null, null, "percent"],
    ["1,250,000", 1_250_000, null, null, null, "number"],
  ] as const)("parses %s", (raw, value, currency, low, high, unit) => {
    expect(parseUnitAwareNumber(raw)).toMatchObject({ valid: true, value, currency, low, high, unit });
  });

  it("parses a mixed-scale monetary range", () => {
    expect(parseUnitAwareNumber("950k–1.45M SAR")).toMatchObject({
      valid: true,
      currency: "SAR",
      low: 950_000,
      high: 1_450_000,
      value: 1_200_000,
      unit: "money",
    });
    expect(parseUnitAwareNumber("950k-1.45M SAR")).toMatchObject({
      valid: true,
      low: 950_000,
      high: 1_450_000,
      value: 1_200_000,
    });
  });

  it("does not confuse a range delimiter with a negative value", () => {
    expect(parseUnitAwareNumber("-1.5M SAR")).toMatchObject({ valid: true, value: -1_500_000 });
  });

  it("parses a month range without treating it as money", () => {
    expect(parseUnitAwareNumber("Month 12–16")).toMatchObject({
      valid: true,
      low: 12,
      high: 16,
      value: 14,
      unit: "month",
    });
  });

  it.each(["Invalid text", "", undefined, null])("returns a missing result for %s", (raw) => {
    expect(parseUnitAwareNumber(raw)).toMatchObject({ valid: false, value: null, low: null, high: null });
  });
});
