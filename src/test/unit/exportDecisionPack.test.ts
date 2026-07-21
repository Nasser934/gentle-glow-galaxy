import { describe, expect, it } from "vitest";
import {
  buildExportDecisionPack,
  extractBreakEvenMonth,
} from "@/lib/exportDecisionPack";
import { completeInputs, makeReport } from "../fixtures/canonicalReport";

describe("export decision pack", () => {
  it("never exports Month 0", () => {
    expect(extractBreakEvenMonth("Month 0")).toBeNull();

    const report = makeReport();
    report.financials.breakEvenSummary = "Month 0";

    const financial = buildExportDecisionPack(report, completeInputs).financial;
    expect(financial.breakEvenDisplay).toBe("Requires validation");
    expect(financial.breakEvenRange).toBe("Requires validation");
  });
});
