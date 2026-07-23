import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { err, ok, sbClient } from "../shared";

export default defineTool({
  name: "get_export_status",
  title: "Get export job status",
  description: "Fetch the current status of a single export job (queued, ready, or failed).",
  inputSchema: {
    export_id: z.string().uuid().describe("Export job UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ export_id }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const { data, error } = await sbClient(ctx)
      .from("report_exports")
      .select("id, report_id, format, status, display_url, error, created_at, updated_at")
      .eq("id", export_id)
      .maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("Export job not found or not accessible.");
    return ok(`Status: ${data.status}${data.error ? ` — ${data.error}` : ""}`, { export: data });
  },
});
