import { describe, expect, it } from "vitest";
import {
  createUrlSafeSlug,
  isUrlSafeSlug,
} from "../../../supabase/functions/_shared/analysis/slug";
import { sanitizeConsumerText } from "../../../supabase/functions/_shared/analysis/wording";
import { deepSanitize } from "../../../supabase/functions/_shared/sanitize";

describe("URL-safe report slugs", () => {
  it("uses only an unambiguous URL-safe alphabet", () => {
    const slug = createUrlSafeSlug(Uint8Array.from({ length: 18 }, (_, index) => index + 1));
    expect(isUrlSafeSlug(slug)).toBe(true);
    expect(slug).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(slug).not.toMatch(/[+/=]/);
  });

  it.each(["abc/def", "abc+def", "abc=def", "", "short"])("rejects unsafe slug %s", (slug) => {
    expect(isUrlSafeSlug(slug)).toBe(false);
  });

  it("generates different values for different bytes", () => {
    expect(createUrlSafeSlug(new Uint8Array(18).fill(1)))
      .not.toBe(createUrlSafeSlug(new Uint8Array(18).fill(2)));
  });

  it("enforces the 96-bit entropy boundary", () => {
    expect(() => createUrlSafeSlug(new Uint8Array(11))).toThrow("between 96 and 512 bits");
    expect(createUrlSafeSlug(new Uint8Array(12))).toHaveLength(24);
    expect(() => createUrlSafeSlug(new Uint8Array(65))).toThrow("between 96 and 512 bits");
  });

  it("enforces the database-compatible maximum slug length", () => {
    expect(isUrlSafeSlug("a".repeat(128))).toBe(true);
    expect(isUrlSafeSlug("a".repeat(129))).toBe(false);
    expect(isUrlSafeSlug("é".repeat(64))).toBe(false);
  });
});

describe("consumer-safe wording", () => {
  it.each([
    ["Final decision", "AI-supported recommendation"],
    ["Success probability", "Probability of positive Year-1 financial outcome under selected assumptions"],
    ["Grounded evidence", "Available external evidence"],
    ["Live Dashboard", "Analysis Dashboard"],
  ])("replaces %s", (before, after) => {
    expect(sanitizeConsumerText(before)).toBe(after);
  });

  it("removes developer diagnostics from user-visible text", () => {
    expect(sanitizeConsumerText("QA failed; fallback used because raw error was returned"))
      .not.toMatch(/QA failed|fallback used|raw error/i);
  });

  it("is idempotent for already consumer-safe confidence wording", () => {
    const safe = "Model-estimated confidence is an analysis indicator.";
    expect(sanitizeConsumerText(sanitizeConsumerText(safe))).toBe(safe);
  });

  it("does not rewrite ordinary domain language", () => {
    expect(sanitizeConsumerText("Consumer confidence improved while confidence was model-estimated."))
      .toBe("Consumer confidence improved while confidence was model-estimated.");
  });

  it("sanitizes report narrative without corrupting source URLs or IDs", () => {
    const report = deepSanitize({
      claimId: "CLM-confidence",
      url: "https://example.com/debug/confidence",
      summary: "Final decision. Confidence is limited because QA failed.",
    });
    expect(report.claimId).toBe("CLM-confidence");
    expect(report.url).toBe("https://example.com/debug/confidence");
    expect(report.summary).toContain("AI-supported recommendation");
    expect(report.summary).toContain("Model-estimated confidence");
    expect(report.summary).not.toMatch(/QA failed/i);
  });
});
