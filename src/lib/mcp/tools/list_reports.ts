import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_reports",
  title: "List my reports",
  description:
    "List feasibility reports owned by the signed-in user. Returns id, title, industry, status, verdict, and updated_at, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum reports to return (1-50)."),
    include_archived: z.boolean().default(false).describe("Include soft-archived reports."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, include_archived }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let query = client(ctx)
      .from("reports")
      .select("id, title, industry, status, updated_at, slug, output")
      .eq("user_id", ctx.getUserId())
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (!include_archived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      industry: r.industry,
      status: r.status,
      slug: r.slug,
      verdict: r?.output?.verdict?.recommendation ?? r?.output?.recommendation ?? null,
      updated_at: r.updated_at,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { reports: rows },
    };
  },
});
