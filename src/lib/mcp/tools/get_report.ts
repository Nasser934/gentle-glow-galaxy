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
  name: "get_report",
  title: "Get a report",
  description:
    "Fetch a full feasibility report (inputs, analysis output, verdict) by report id or slug. Only returns reports the signed-in user can access.",
  inputSchema: {
    id: z.string().optional().describe("Report UUID."),
    slug: z.string().optional().describe("Public share slug."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, slug }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!id && !slug) {
      return { content: [{ type: "text", text: "Provide id or slug" }], isError: true };
    }
    const sb = client(ctx);
    const q = sb.from("reports").select("*");
    const { data, error } = id ? await q.eq("id", id).maybeSingle() : await q.eq("slug", slug!).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Report not found" }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { report: data },
    };
  },
});
