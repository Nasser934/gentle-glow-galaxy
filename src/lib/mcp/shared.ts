import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  CANONICAL_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
  conceptInputsSchema,
  feasibilityReportSchema,
  normalizeExternalAnalysis,
  type ExternalNormalizationOptions,
  type ExternalNormalizationResult,
  type ReportValidationIssue,
} from "../reportContract";

type UnknownRecord = Record<string, unknown>;

export function sbClient(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function ok(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: structured,
  };
}

// Max serialized payload size for external analysis submissions (~256 KB).
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const MAX_AGENT_METADATA_BYTES = 32 * 1024;

/**
 * Generated from the exact same schemas used to validate the dashboard and
 * exporters. Legacy aliases are accepted by the normalizer, but callers should
 * submit these canonical camelCase structures.
 */
export const EXTERNAL_ANALYSIS_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ConceptAICanonicalExternalAnalysis",
  type: "object",
  required: ["inputs", "analysis"],
  properties: {
    schema_version: {
      type: "string",
      enum: [SOURCE_SCHEMA_VERSION],
      description: `External submission schema version. Defaults to ${SOURCE_SCHEMA_VERSION}.`,
    },
    title: {
      type: "string",
      description: "Optional compatibility alias for inputs.projectName.",
    },
    industry: {
      type: "string",
      description: "Optional compatibility alias for inputs.industry.",
    },
    inputs: z.toJSONSchema(conceptInputsSchema, { target: "draft-7" }),
    analysis: z.toJSONSchema(feasibilityReportSchema, { target: "draft-7" }),
    agent_metadata: {
      type: "object",
      additionalProperties: true,
      description: "Optional external assistant model/version metadata.",
    },
  },
  additionalProperties: false,
  "x-accepted-legacy-aliases": {
    "analysis.fmarto_scores": "analysis.scores",
    "analysis.fmarto": "analysis.scores",
    "analysis.next_steps": "analysis.nextSteps",
    "analysis.executive_summary": "analysis.executiveSummary",
    "analysis.funding_mix": "analysis.fundingMix",
    "analysis.funding_advisory": "analysis.fundingAdvisory",
  },
} as const;

/** Strip fields callers must never control, without mutating the caller object. */
export const FORBIDDEN_INPUT_KEYS = new Set([
  "user_id",
  "id",
  "slug",
  "display_id",
  "canonical_validated",
  "root_report_id",
  "parent_report_id",
  "created_at",
  "updated_at",
  "is_public",
  "archived_at",
]);

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

export function sanitizeExternalPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !FORBIDDEN_INPUT_KEYS.has(key)),
  );
}

export function validatePayloadSize(payload: unknown): ReportValidationIssue[] {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload ?? {});
  } catch {
    return [{ path: "$", message: "payload must be JSON-serializable" }];
  }
  return new TextEncoder().encode(serialized).length > MAX_PAYLOAD_BYTES
    ? [{ path: "$", message: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes` }]
    : [];
}

export function validateAgentMetadataSize(payload: unknown): ReportValidationIssue[] {
  if (!isRecord(payload) || payload.agent_metadata === undefined) return [];
  if (!isRecord(payload.agent_metadata)) {
    return [{ path: "agent_metadata", message: "agent_metadata must be an object" }];
  }
  const serialized = JSON.stringify(payload.agent_metadata);
  return new TextEncoder().encode(serialized).length > MAX_AGENT_METADATA_BYTES
    ? [{
        path: "agent_metadata",
        message: `agent_metadata exceeds ${MAX_AGENT_METADATA_BYTES} bytes`,
      }]
    : [];
}

/**
 * Single pre-save gate used by validate/create/update. A successful result is
 * guaranteed to satisfy the same canonical contract used by React and exports.
 */
export function prepareExternalAnalysisForSave(
  payload: unknown,
  options: ExternalNormalizationOptions = {},
): ExternalNormalizationResult {
  const sizeIssues = validatePayloadSize(payload);
  if (sizeIssues.length > 0) return { valid: false, issues: sizeIssues };
  const metadataIssues = validateAgentMetadataSize(payload);
  if (metadataIssues.length > 0) return { valid: false, issues: metadataIssues };
  return normalizeExternalAnalysis(sanitizeExternalPayload(payload), options);
}

/** Backwards-compatible named validator for MCP callers and focused tests. */
export function validateExternalAnalysis(payload: unknown): ReportValidationIssue[] {
  const result = prepareExternalAnalysisForSave(payload, { reportId: "EXTERNAL-VALIDATION" });
  return result.valid ? [] : result.issues;
}

export function validationErrorResult(issues: ReportValidationIssue[]) {
  return {
    content: [{
      type: "text" as const,
      text: `Validation failed with ${issues.length} issue(s):\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    }],
    structuredContent: { valid: false, issues },
    isError: true as const,
  };
}

export function externalAgentMetadata(
  payload: unknown,
  warnings: string[],
  existing: unknown = {},
): UnknownRecord {
  const clean = sanitizeExternalPayload(payload);
  const payloadRecord = isRecord(clean) ? clean : {};
  const existingRecord = isRecord(existing) ? existing : {};
  const reservedKeys = new Set([
    "legacy_snapshot",
    "legacy_agent_metadata",
    "canonical_schema_version",
    "normalized_at",
    "normalization_warnings",
    "backfilled_at",
    "canonical_repair_failed_at",
    "canonical_repair_errors",
    "source_payload",
    "original_payload",
    "source_schema_version",
    "normalization_timestamp",
  ]);
  const supplied = isRecord(payloadRecord.agent_metadata)
    ? Object.fromEntries(
        Object.entries(payloadRecord.agent_metadata)
          .filter(([key]) => !reservedKeys.has(key)),
      )
    : {};
  const preserved = Object.fromEntries(
    Object.entries(existingRecord).filter(([key]) => (
      reservedKeys.has(key) && key !== "source_payload" && key !== "original_payload"
    )),
  );
  const existingAgentMetadata = isRecord(existingRecord.agent_metadata)
    ? existingRecord.agent_metadata
    : {};
  const legacyTopLevelMetadata = Object.fromEntries(
    Object.entries(existingRecord).filter(([key]) => (
      !reservedKeys.has(key) && key !== "agent_metadata"
    )),
  );
  const legacyAgentMetadata = isRecord(existingRecord.legacy_agent_metadata)
    ? existingRecord.legacy_agent_metadata
    : legacyTopLevelMetadata;
  const agentMetadata = Object.keys(supplied).length > 0
    ? supplied
    : existingAgentMetadata;
  return {
    ...preserved,
    ...(Object.keys(legacyAgentMetadata).length > 0
      ? { legacy_agent_metadata: legacyAgentMetadata }
      : {}),
    agent_metadata: agentMetadata,
    source_schema_version: SOURCE_SCHEMA_VERSION,
    canonical_schema_version: CANONICAL_SCHEMA_VERSION,
    normalized_at: new Date().toISOString(),
    normalization_timestamp: new Date().toISOString(),
    normalization_warnings: warnings,
    original_payload: clean,
  };
}

export interface DisplayPathReport {
  id: string;
  slug?: string | null;
  is_public?: boolean | null;
}

export function reportDisplayPath(report: DisplayPathReport): string {
  if (report.is_public === true && report.slug) return `/r/${report.slug}`;
  return `/reports/${report.id}`;
}
