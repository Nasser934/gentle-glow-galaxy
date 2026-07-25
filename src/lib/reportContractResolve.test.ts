import { describe, expect, it } from "vitest";
import {
  CANONICAL_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
  normalizeExternalAnalysisToCanonicalReport,
  resolveCanonicalReportData,
  validateCanonicalReportData,
} from "@/lib/reportContract";
import {
  canonicalInputsFixture,
  canonicalReportFixture,
  legacyThermoFlowExternalPayload,
} from "@/test/fixtures/reports";

describe("canonical read-path resolver", () => {
  it("passes canonical rows through untouched and unrepaired", () => {
    const result = resolveCanonicalReportData(canonicalInputsFixture, canonicalReportFixture);
    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected canonical fixture to validate");
    expect(result.repaired).toBe(false);
    expect(result.output.scores.overall).toBe(canonicalReportFixture.scores.overall);
  });

  it("repairs a legacy external-agent row that still stores the raw payload", () => {
    const raw = legacyThermoFlowExternalPayload;
    expect(validateCanonicalReportData(raw.inputs, raw.analysis).valid).toBe(false);

    const result = resolveCanonicalReportData(raw.inputs, raw.analysis, {
      reportId: "CAI-2026-00000094",
      title: raw.title,
      industry: raw.industry,
    });

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected legacy row to be repaired");
    expect(result.repaired).toBe(true);
    expect(result.output.scores).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    // A repaired report must itself be canonical — no second repair needed.
    expect(validateCanonicalReportData(result.inputs, result.output).valid).toBe(true);
  });

  it("returns structured issues instead of throwing on unusable data", () => {
    const result = resolveCanonicalReportData(null, { nothing: true });
    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("expected unusable data to fail");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.every((issue) => typeof issue.path === "string")).toBe(true);
  });

  it("publishes stable schema versions used by the persistence columns", () => {
    expect(SOURCE_SCHEMA_VERSION).toBe("external_agent.v1");
    expect(CANONICAL_SCHEMA_VERSION).toBe("canonical_report.v2");
    const normalized = normalizeExternalAnalysisToCanonicalReport(
      legacyThermoFlowExternalPayload,
      { reportId: "CAI-2026-00000095" },
    );
    expect(normalized.valid).toBe(true);
  });
});
