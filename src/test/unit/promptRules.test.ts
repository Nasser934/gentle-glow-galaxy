import { describe, expect, it } from "vitest";
import { REPORT_CONTENT_RULES } from "../../../supabase/functions/_shared/analysis/promptRules";

describe("report prompt rules", () => {
  it("requires positive break-even, tailored controls, and safe missing values", () => {
    expect(REPORT_CONTENT_RULES).toContain("positive month");
    expect(REPORT_CONTENT_RULES).toContain("specific mitigation");
    expect(REPORT_CONTENT_RULES).toContain("internal missing-value sentinel");
    expect(REPORT_CONTENT_RULES).not.toContain("Use zero for unsupported figures");
  });
});
