import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  err,
  externalAgentMetadata,
  ok,
  prepareExternalAnalysisForSave,
  sbClient,
  validationErrorResult,
} from "../shared";
import { CANONICAL_SCHEMA_VERSION, SOURCE_SCHEMA_VERSION } from "../../reportContract";

export default defineTool({
  name: "update_external_analysis",
  title: "Update an external-agent report",
  description:
    "Replace the analysis of an existing external-agent report you own. Concept AI re-validates and recomputes canonical scores. Reports created via the in-app workflow cannot be updated through this tool.",
  inputSchema: {
    report_id: z.string().uuid().describe("Report UUID to update."),
    idempotency_key: z.string().min(8).max(128).describe("Unique key per update."),
    payload: z.any().describe("Full external analysis JSON (same shape as create)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ report_id, idempotency_key, payload }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const userId = ctx.getUserId();
    const sb = sbClient(ctx);

    const { data: prior } = await sb
      .from("mcp_write_idempotency")
      .select("response")
      .eq("user_id", userId)
      .eq("tool_name", "update_external_analysis")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (prior) return ok("Update already applied (idempotent).", { idempotent: true });

    const { data: current } = await sb
      .from("reports")
      .select("id, user_id, source_mode, display_id, output, external_agent_metadata")
      .eq("id", report_id)
      .maybeSingle();
    if (!current) return err("Report not found or not accessible.");
    if (current.user_id !== userId) return err("Only the report owner can update it.");
    if (current.source_mode !== "external_agent") {
      return err("This report was not created by an external assistant; use the in-app workflow to edit it.");
    }

    const currentOutput = (
      current.output
      && typeof current.output === "object"
      && !Array.isArray(current.output)
    ) ? current.output as Record<string, unknown> : {};
    const normalized = prepareExternalAnalysisForSave(payload, {
      reportId: typeof currentOutput.reportId === "string"
        ? currentOutput.reportId
        : current.display_id,
    });
    if (!normalized.valid) return validationErrorResult(normalized.issues);

    const { error: updErr } = await sb
      .from("reports")
      .update({
        title: normalized.inputs.projectName.slice(0, 200),
        industry: normalized.inputs.industry,
        inputs: normalized.inputs,
        output: normalized.output,
        external_agent_metadata: externalAgentMetadata(
          payload,
          normalized.warnings,
          current.external_agent_metadata,
        ),
        canonical_validated: true,
        source_schema_version: SOURCE_SCHEMA_VERSION,
        canonical_schema_version: CANONICAL_SCHEMA_VERSION,
        normalization_warnings: normalized.warnings,
        normalization_timestamp: new Date().toISOString(),
      source_schema_version: SOURCE_SCHEMA_VERSION,
      canonical_schema_version: CANONICAL_SCHEMA_VERSION,
      normalization_warnings: normalized.warnings,
      normalization_timestamp: new Date().toISOString(),
      })
      .eq("id", report_id)
      .eq("user_id", userId);
    if (updErr) return err(updErr.message);

    await sb.from("mcp_write_idempotency").insert({
      user_id: userId,
      tool_name: "update_external_analysis",
      idempotency_key,
      report_id,
      response: {},
    });

    return ok(`Report ${report_id} updated with canonical validated data.`, {
      report_id,
      warnings: normalized.warnings,
      source_schema_version: SOURCE_SCHEMA_VERSION,
      canonical_schema_version: CANONICAL_SCHEMA_VERSION,
      normalization_changes: normalized.warnings,
    });
  },
});
