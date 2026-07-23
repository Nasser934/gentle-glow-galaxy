import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { err, ok, sbClient } from "../shared";

export default defineTool({
  name: "list_report_exports",
  title: "List export jobs for a report",
  description: "List all export jobs (PDF/XLSX/PPTX) for a report you own, newest first.",
  inputSchema: {
    report_id: z.string().uuid().describe("Report UUID."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ report_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const { data, error } = await sbClient(ctx)
      .from("report_exports")
      .select("id, format, status, display_url, error, created_at, updated_at")
      .eq("report_id", report_id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return err(error.message);
    return ok(JSON.stringify(data ?? [], null, 2), { exports: data ?? [] });
  },
});
