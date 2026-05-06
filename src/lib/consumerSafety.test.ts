import { describe, expect, it } from "vitest";
import { containsBlockedConsumerLanguage, sanitizeConsumerObject, sanitizeConsumerText } from "./consumerSafety";

describe("consumer safety wording", () => {
  it("replaces internal system wording with consumer-safe wording", () => {
    const text = sanitizeConsumerText("This draft was generated locally because the analysis Edge Function is unreachable. Treat market figures as directional until live research is restored.");

    expect(text.toLowerCase()).not.toContain("edge function");
    expect(text.toLowerCase()).not.toContain("generated locally");
    expect(text.toLowerCase()).not.toContain("unreachable");
    expect(text).toContain("validation assumptions");
  });

  it("sanitizes nested report content", () => {
    const report = sanitizeConsumerObject({
      executiveSummary: "QA failed. Report quality is weak.",
      research: { overview: "Live research unavailable in fallback mode." },
      recommendations: ["Required template terms are missing from the report."],
    });

    expect(containsBlockedConsumerLanguage(report)).toBe(false);
    expect(JSON.stringify(report)).toContain("validated");
  });

  it("detects unsafe consumer wording before sanitization", () => {
    expect(containsBlockedConsumerLanguage({ body: "Template mismatch detected" })).toBe(true);
    expect(containsBlockedConsumerLanguage({ body: "Some assumptions should be validated before approval." })).toBe(false);
  });
});
