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
  name: "set_report_status",
  title: "Change a report's status",
  description:
    "Update the decision status of a report the signed-in user owns. Allowed statuses: draft, in_review, approved, rejected, archived.",
  inputSchema: {
    report_id: z.string().uuid().describe("Report UUID."),
    status: z.enum(["draft", "in_review", "approved", "rejected", "archived"]).describe("New status."),
    note: z.string().max(500).optional().describe("Optional note recorded in status history."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ report_id, status, note }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = client(ctx);
    const { data: current } = await sb
      .from("reports")
      .select("id, status, user_id")
      .eq("id", report_id)
      .maybeSingle();
    if (!current) return { content: [{ type: "text", text: "Report not found or not accessible." }], isError: true };
    if (current.user_id !== ctx.getUserId()) {
      return { content: [{ type: "text", text: "Only the report owner can change status." }], isError: true };
    }
    const from_status = current.status;
    const { error: updErr } = await sb.from("reports").update({ status }).eq("id", report_id);
    if (updErr) return { content: [{ type: "text", text: updErr.message }], isError: true };
    await sb.from("report_status_history").insert({
      report_id,
      from_status,
      to_status: status,
      note: note ?? null,
      changed_by: ctx.getUserId(),
    });
    return {
      content: [{ type: "text", text: `Status updated from ${from_status} to ${status}.` }],
      structuredContent: { report_id, from_status, to_status: status },
    };
  },
});
