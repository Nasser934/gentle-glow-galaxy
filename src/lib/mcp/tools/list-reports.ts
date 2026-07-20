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
  name: "list_reports",
  title: "List my analyses",
  description:
    "List the signed-in user's Concept AI feasibility analyses (title, industry, status, verdict, share slug, created date). Newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of analyses to return (1-50)."),
    includeArchived: z.boolean().default(false).describe("Include soft-archived analyses."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, includeArchived }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    let q = client(ctx)
      .from("reports")
      .select("id, display_id, title, industry, status, slug, is_public, created_at, updated_at, archived_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { reports: data ?? [] },
    };
  },
});
