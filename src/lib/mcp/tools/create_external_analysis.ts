import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  FORBIDDEN_INPUT_KEYS,
  MAX_PAYLOAD_BYTES,
  err,
  normalizeToCanonicalOutput,
  ok,
  sbClient,
  validateExternalAnalysis,
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
    const raw = JSON.stringify(payload ?? {});
    if (raw.length > MAX_PAYLOAD_BYTES) return err(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);

    // Strip forbidden ownership/system keys from payload before we touch anything.
    if (payload && typeof payload === "object") {
      for (const k of Object.keys(payload)) {
        if (FORBIDDEN_INPUT_KEYS.has(k)) delete (payload as any)[k];
      }
    }

    const issues = validateExternalAnalysis(payload);
    if (issues.length > 0) {
      return {
        content: [{ type: "text" as const, text: `Validation failed with ${issues.length} issue(s).` }],
        structuredContent: { valid: false, issues },
        isError: true as const,
      };
    }

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

    const canonical = normalizeToCanonicalOutput(payload);
    const insert = {
      user_id: userId,
      title: String((payload as any).title).slice(0, 200),
      industry: String((payload as any).industry),
      inputs: (payload as any).inputs ?? {},
      output: canonical,
      source_mode: "external_agent",
      external_agent_metadata: (payload as any).agent_metadata ?? {},
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

    return ok(`Report ${data.display_id} created (id: ${data.id}). Concept AI will recompute canonical scores.`, {
      report_id: data.id,
      slug: data.slug,
      display_id: data.display_id,
    });
  },
});
