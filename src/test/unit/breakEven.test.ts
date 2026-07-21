import { describe, expect, it } from "vitest";
import { extractBreakEvenMonth, formatBreakEvenDisplay } from "@/lib/breakEven";

describe("break-even display", () => {
  it("preserves bounded month and year horizons", () => {
    expect(formatBreakEvenDisplay("18–24 months")).toBe("Month 18–24");
    expect(formatBreakEvenDisplay("2–3 years")).toBe("Year 2–3");
    expect(formatBreakEvenDisplay("M26")).toBe("Month 26");
    expect(formatBreakEvenDisplay("Y3")).toBe("Year 3");
  });

  it("rejects missing, non-positive, and unbounded horizons", () => {
    expect(formatBreakEvenDisplay(undefined)).toBe("Requires validation");
    expect(formatBreakEvenDisplay("Month 0")).toBe("Requires validation");
    expect(formatBreakEvenDisplay("24000000 months")).toBe("Requires validation");
    expect(extractBreakEvenMonth("Y11")).toBeNull();
  });
});
