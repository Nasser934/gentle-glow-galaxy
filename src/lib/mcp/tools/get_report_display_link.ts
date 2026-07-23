import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { err, ok, reportDisplayPath, sbClient } from "../shared";

function siteOrigin(): string {
  return process.env.APP_SITE_URL ?? "https://gentle-glow-galaxy.lovable.app";
}

export default defineTool({
  name: "get_report_display_link",
  title: "Get shareable link for a report",
  description:
    "Return the shareable Concept AI URL where a report is displayed (dashboard, charts, evidence, exports). Only works for reports the signed-in user can access.",
  inputSchema: {
    report_id: z.string().uuid().optional().describe("Report UUID."),
    slug: z.string().optional().describe("Report share slug."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ report_id, slug }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    if (!report_id && !slug) return err("Provide report_id or slug");
    const sb = sbClient(ctx);
    const q = sb.from("reports").select("id, slug, is_public");
    const { data, error } = report_id
      ? await q.eq("id", report_id).maybeSingle()
      : await q.eq("slug", slug!).maybeSingle();
    if (error) return err(error.message);
    if (!data) return err("Report not found or not accessible.");
    const path = reportDisplayPath(data);
    const url = `${siteOrigin()}${path}`;
    return ok(url, {
      url,
      path,
      report_id: data.id,
      slug: data.slug,
      is_public: data.is_public,
    });
  },
});
