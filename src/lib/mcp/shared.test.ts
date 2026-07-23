import { describe, expect, it } from "vitest";
import {
  EXTERNAL_ANALYSIS_SCHEMA,
  MAX_AGENT_METADATA_BYTES,
  externalAgentMetadata,
  prepareExternalAnalysisForSave,
  reportDisplayPath,
  sanitizeExternalPayload,
} from "@/lib/mcp/shared";
import {
  canonicalInputsFixture,
  canonicalReportFixture,
  legacyThermoFlowExternalPayload,
} from "@/test/fixtures/reports";

describe("external-analysis MCP gate", () => {
  it("rejects an invalid analysis before any save can occur", () => {
    const result = prepareExternalAnalysisForSave({
      inputs: canonicalInputsFixture,
      analysis: {
        ...canonicalReportFixture,
        scores: undefined,
      },
    });

    expect(result.valid).toBe(false);
    if ("output" in result) throw new Error("expected invalid external analysis");
    expect(result.issues.some((issue) => issue.path === "analysis.scores")).toBe(true);
  });

  it("normalizes a legacy submission into canonical save data", () => {
    const result = prepareExternalAnalysisForSave(legacyThermoFlowExternalPayload, {
      reportId: "CAI-2026-00000094",
    });

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error("expected legacy external analysis to validate");
    expect(result.output.scores).toBeDefined();
    expect(result.output.nextSteps).toEqual(["Commission an independent demand study."]);
    expect("fmarto_scores" in result.output).toBe(false);
    expect("next_steps" in result.output).toBe(false);
  });

  it("advertises the same canonical ConceptInputs and FeasibilityReport fields", () => {
    expect(EXTERNAL_ANALYSIS_SCHEMA.properties.inputs).toMatchObject({
      required: expect.arrayContaining(["projectName", "industry", "description"]),
    });
    expect(EXTERNAL_ANALYSIS_SCHEMA.properties.analysis).toMatchObject({
      required: expect.arrayContaining([
        "scores",
        "market",
        "financials",
        "risks",
        "fundingMix",
        "competitors",
        "recommendations",
        "nextSteps",
      ]),
    });
  });

  it("removes ownership and publication fields without mutating the caller payload", () => {
    const payload = {
      ...legacyThermoFlowExternalPayload,
      user_id: "attacker",
      is_public: true,
    };

    const sanitized = sanitizeExternalPayload(payload) as Record<string, unknown>;

    expect(sanitized.user_id).toBeUndefined();
    expect(sanitized.is_public).toBeUndefined();
    expect(payload.user_id).toBe("attacker");
    expect(payload.is_public).toBe(true);
  });

  it("does not retain the complete raw payload in report metadata", () => {
    const metadata = externalAgentMetadata(
      {
        ...legacyThermoFlowExternalPayload,
        private_note: "must not be persisted outside the canonical report",
      },
      ["Evidence warning"],
    );

    expect(metadata.source_payload).toBeUndefined();
    expect(metadata.private_note).toBeUndefined();
    expect(metadata.agent_metadata).toEqual(legacyThermoFlowExternalPayload.agent_metadata);
  });

  it("replaces caller metadata while preserving fixed server provenance", () => {
    const existing = {
      legacy_snapshot: { output: { fmarto_scores: { financial: 72 } } },
      agent_metadata: { model: "old-model", old_key: "old-value" },
      canonical_schema_version: "feasibility-report.v1",
      normalized_at: "2026-01-01T00:00:00.000Z",
      normalization_warnings: ["old warning"],
    };
    const next = externalAgentMetadata(
      {
        ...legacyThermoFlowExternalPayload,
        agent_metadata: {
          model: "new-model",
          new_key: "new-value",
          legacy_snapshot: "caller cannot replace server provenance",
        },
      },
      [],
      existing,
    );

    expect(next.legacy_snapshot).toEqual(existing.legacy_snapshot);
    expect(next.agent_metadata).toEqual({
      model: "new-model",
      new_key: "new-value",
    });
    expect(JSON.stringify(next)).not.toContain("old-value");
  });

  it("rejects oversized agent metadata before saving", () => {
    const oversized = structuredClone(legacyThermoFlowExternalPayload) as unknown as {
      agent_metadata: Record<string, unknown>;
    };
    oversized.agent_metadata = {
      notes: "x".repeat(MAX_AGENT_METADATA_BYTES + 1),
    };

    const result = prepareExternalAnalysisForSave(oversized);

    expect(result.valid).toBe(false);
    if ("output" in result) throw new Error("expected oversized metadata to fail");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "agent_metadata" }),
      ]),
    );
  });
});

describe("report display paths", () => {
  it("uses the owner route for a private report", () => {
    expect(reportDisplayPath({
      id: "abe31755-972d-4b8b-86e3-62657db46f1d",
      slug: "private-slug",
      is_public: false,
    })).toBe("/reports/abe31755-972d-4b8b-86e3-62657db46f1d");
  });

  it("uses the public slug route only for a public report", () => {
    expect(reportDisplayPath({
      id: "abe31755-972d-4b8b-86e3-62657db46f1d",
      slug: "public-slug",
      is_public: true,
    })).toBe("/r/public-slug");
  });
});
