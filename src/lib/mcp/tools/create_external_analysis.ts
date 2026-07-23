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

export default defineTool({
  name: "create_external_analysis",
  title: "Create report from external analysis",
  description:
    "Create a new Concept AI report from a completed external-assistant analysis. Concept AI validates the payload, stores a canonical report (source_mode=external_agent), and recomputes authoritative FMART-O scores & financial totals. Rejects client-supplied ownership fields.",
  inputSchema: {
    idempotency_key: z
      .string()
      .min(8)
      .max(128)
      .describe("Unique key per submission to safely retry without duplicates."),
    payload: z.any().describe("External analysis JSON matching get_analysis_schema."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ idempotency_key, payload }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const userId = ctx.getUserId();
    const normalized = prepareExternalAnalysisForSave(payload, {
      reportId: `EXT-${idempotency_key.slice(0, 20).toUpperCase()}`,
    });
    if (!normalized.valid) return validationErrorResult(normalized.issues);

    const sb = sbClient(ctx);

    // Idempotency check.
    const { data: prior } = await sb
      .from("mcp_write_idempotency")
      .select("report_id, response")
      .eq("user_id", userId)
      .eq("tool_name", "create_external_analysis")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (prior?.report_id) {
      return ok(`Report already created (idempotent): ${prior.report_id}`, {
        report_id: prior.report_id,
        idempotent: true,
        ...(prior.response as object),
      });
    }

    const insert = {
      user_id: userId,
      title: normalized.inputs.projectName.slice(0, 200),
      industry: normalized.inputs.industry,
      inputs: normalized.inputs,
      output: normalized.output,
      source_mode: "external_agent",
      external_agent_metadata: externalAgentMetadata(payload, normalized.warnings),
      canonical_validated: true,
      is_public: false,
      status: "draft" as const,
    };
    const { data, error } = await sb.from("reports").insert(insert).select("id, slug, display_id").maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("Failed to create report");

    await sb.from("mcp_write_idempotency").insert({
      user_id: userId,
      tool_name: "create_external_analysis",
      idempotency_key,
      report_id: data.id,
      response: { slug: data.slug, display_id: data.display_id },
    });

    return ok(`Report ${data.display_id} created with canonical validated data (id: ${data.id}).`, {
      report_id: data.id,
      slug: data.slug,
      display_id: data.display_id,
      warnings: normalized.warnings,
    });
  },
});
