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
  name: "add_comment",
  title: "Add a comment to a report",
  description: "Post a new comment on a report as the signed-in user.",
  inputSchema: {
    report_id: z.string().uuid().describe("Report UUID."),
    body: z.string().min(1).max(4000).describe("Comment body (plain text or markdown)."),
    section: z.string().max(80).optional().describe("Optional section identifier the comment refers to."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ report_id, body, section }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await client(ctx)
      .from("report_comments")
      .insert({ report_id, body, section: section ?? null, user_id: ctx.getUserId() })
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Comment ${data?.id} added.` }],
      structuredContent: { comment: data },
    };
  },
});
