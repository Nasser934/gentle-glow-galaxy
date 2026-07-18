import { describe, expect, it } from "vitest";
import {
  mergeAcceptedAiSuggestions,
  validateConceptInputs,
  validateInputOrigins,
} from "../../../supabase/functions/_shared/analysis/input";
import { completeInputs } from "../fixtures/canonicalReport";

describe("server concept input validation", () => {
  it("accepts a complete brief and normalizes URLs", () => {
    const result = validateConceptInputs(completeInputs);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.classification).toBe("complete");
      expect(result.data.competitorUrls).toEqual([
        "https://example.com/one",
        "https://example.org/two",
      ]);
    }
  });

  it.each([
    ["projectName", ""],
    ["industry", ""],
    ["description", "short"],
    ["budgetRange", ""],
    ["timeline", ""],
  ])("rejects missing or thin required field %s", (field, value) => {
    const result = validateConceptInputs({ ...completeInputs, [field]: value });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate URLs", () => {
    const result = validateConceptInputs({
      ...completeInputs,
      competitorUrls: "https://example.com/a\nhttps://EXAMPLE.com/a/",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map((issue) => issue.code)).toContain("duplicate_url");
  });

  it.each([
    "ftp://example.com",
    "javascript:alert(1)",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://[fc00::1]/admin",
    "http://[fe80::1]/admin",
    "https://metadata.google.internal/computeMetadata/v1",
  ])("rejects unsafe URL %s", (url) => {
    const result = validateConceptInputs({ ...completeInputs, competitorUrls: url });
    expect(result.success).toBe(false);
  });

  it("rejects unsupported fields and oversized payloads", () => {
    const unsupported = validateConceptInputs({ ...completeInputs, secretField: "unexpected" });
    expect(unsupported.success).toBe(false);
    const oversized = validateConceptInputs({ ...completeInputs, assumptions: "x".repeat(80_000) });
    expect(oversized.success).toBe(false);
  });

  it("classifies a valid but weak brief without inflating confidence", () => {
    const result = validateConceptInputs({
      ...completeInputs,
      strategicObjectives: "",
      founderExperience: "",
      assumptions: "",
      knownRisks: "",
      regulatoryConsiderations: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.classification).toBe("thin");
  });

  it("accepts SAR, AED, EUR, GBP, and USD unit-aware budgets", () => {
    for (const budgetRange of ["SAR 1.5M – 2M", "AED 900k", "EUR 2 million", "GBP 750,000", "USD 1.2M"]) {
      expect(validateConceptInputs({ ...completeInputs, budgetRange }).success).toBe(true);
    }
  });

  it("classifies internal/commercial model contradictions as thin", () => {
    const result = validateConceptInputs({
      ...completeInputs,
      businessModel: "Internal Platform / Cost Avoidance",
      revenueModel: "Recurring subscription",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.classification).toBe("thin");
      expect(result.issues.map((issue) => issue.code)).toContain("business_model_conflict");
    }
  });

  it("flags implausible infrastructure timeline and team combinations", () => {
    const result = validateConceptInputs({
      ...completeInputs,
      businessModel: "Infrastructure / Capex Project",
      timeline: "< 3 months",
      teamSize: "1 – 5",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "infrastructure_timeline_risk",
      "infrastructure_team_size_risk",
    ]));
  });

  it("flags multiple explicit currencies", () => {
    const result = validateConceptInputs({
      ...completeInputs,
      budgetRange: "SAR 1M – 2M",
      assumptions: "Supplier pricing is USD 100,000 and the remaining figures are SAR.",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.issues.map((issue) => issue.code)).toContain("currency_conflict");
  });
});

describe("AI field suggestions", () => {
  it("only applies explicitly accepted suggestions and never silently overwrites user text", () => {
    const merged = mergeAcceptedAiSuggestions(
      { ...completeInputs, strategicObjectives: "My objective", assumptions: "My assumptions" },
      { strategicObjectives: "AI objective", assumptions: "AI assumptions", knownRisks: "AI risk" },
      ["knownRisks"],
    );
    expect(merged.inputs.strategicObjectives).toBe("My objective");
    expect(merged.inputs.assumptions).toBe("My assumptions");
    expect(merged.inputs.knownRisks).toBe("AI risk");
    expect(merged.origins.knownRisks).toBe("accepted_ai_suggestion");
  });

  it("stores only supported field-origin states", () => {
    expect(validateInputOrigins({
      description: "edited_after_ai_suggestion",
      assumptions: "accepted_ai_suggestion",
      secretField: "user_input",
      knownRisks: "invented_state",
    })).toEqual({
      description: "edited_after_ai_suggestion",
      assumptions: "accepted_ai_suggestion",
    });
  });
});
