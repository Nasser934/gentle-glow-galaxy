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
    const raw = JSON.stringify(payload ?? {});
    if (raw.length > MAX_PAYLOAD_BYTES) return err(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);

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
      .select("id, user_id, source_mode")
      .eq("id", report_id)
      .maybeSingle();
    if (!current) return err("Report not found or not accessible.");
    if (current.user_id !== userId) return err("Only the report owner can update it.");
    if (current.source_mode !== "external_agent") {
      return err("This report was not created by an external assistant; use the in-app workflow to edit it.");
    }

    const canonical = normalizeToCanonicalOutput(payload);
    const { error: updErr } = await sb
      .from("reports")
      .update({
        title: String((payload as any).title).slice(0, 200),
        industry: String((payload as any).industry),
        inputs: (payload as any).inputs ?? {},
        output: canonical,
        external_agent_metadata: (payload as any).agent_metadata ?? {},
      })
      .eq("id", report_id);
    if (updErr) return err(updErr.message);

    await sb.from("mcp_write_idempotency").insert({
      user_id: userId,
      tool_name: "update_external_analysis",
      idempotency_key,
      report_id,
      response: {},
    });

    return ok(`Report ${report_id} updated.`, { report_id });
  },
});
