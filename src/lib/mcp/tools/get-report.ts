declare const process: { env: Record<string, string | undefined> };
import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_report",
  title: "Get analysis",
  description:
    "Return a full Concept AI feasibility analysis (inputs, canonical report output, FMART-O scores, verdict, evidence) by report id, display id, or share slug.",
  inputSchema: {
    identifier: z
      .string()
      .trim()
      .min(3)
      .describe("Report UUID, display id (e.g. CAI-2026-00000123), or public share slug."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ identifier }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    const col = uuid ? "id" : identifier.startsWith("CAI-") ? "display_id" : "slug";
    const { data, error } = await client(ctx)
      .from("reports")
      .select("*")
      .eq(col, identifier)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Report not found or access denied." }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { report: data },
    };
  },
});
