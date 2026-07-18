import { describe, expect, it } from "vitest";
import { demoInputs, demoReport } from "@/data/demoReport";
import { validateFinancialModel } from "../../../supabase/functions/_shared/analysis/financial";
import { calculateAuthoritativeScore } from "../../../supabase/functions/_shared/analysis/scoring";
import { detectProjectType } from "../../../supabase/functions/_shared/analysis/simulation";

describe("synthetic hackathon demo", () => {
  it("is explicitly synthetic in report metadata and user-facing labels", () => {
    expect(demoReport.demo?.synthetic).toBe(true);
    expect(demoReport.demo?.label).toBe("Illustrative Demo — Synthetic Data");
    expect(demoReport.demo?.disclaimer).toBe("Synthetic demonstration — not measured organizational results");
  });

  it("uses an internal-project financial model", () => {
    expect(detectProjectType(demoInputs)).toBe("internal");
    expect(JSON.stringify(demoReport.financials.scenarios)).not.toMatch(/subscriber|CAC|customer acquisition|commercial revenue/i);
  });

  it("has a correct weighted score and deterministic verdict", () => {
    const result = calculateAuthoritativeScore({
      scores: demoReport.scores,
      modelWeights: demoReport.scores.weights,
      industry: demoInputs.industry,
      modelProposedOverall: demoReport.scores.overall,
      modelProposedVerdict: demoReport.scores.verdict,
      governance: {
        overallConfidencePct: demoReport.decision?.overallConfidencePct ?? 65,
        inputQuality: demoReport.inputQualityScore ?? 80,
        hasUnmitigatedCriticalRisk: false,
      },
    });
    expect(demoReport.scores.overall).toBeCloseTo(result.finalAuthoritativeScore, 10);
    expect(demoReport.scores.verdict).toBe(result.verdict);
  });

  it("passes CapEx, OpEx, funding, scenario, market, and currency checks", () => {
    const validation = validateFinancialModel(demoReport);
    expect(validation.valid, validation.warnings.map((warning) => warning.message).join("\n")).toBe(true);
  });

  it("contains no unsupported claims of actual internal studies or measured results", () => {
    const serialized = JSON.stringify(demoReport);
    expect(serialized).not.toMatch(/internal time-and-motion|supervisor interviews|PMO finance confirmation|confirmed by PMO|actual operational results/i);
  });
});
