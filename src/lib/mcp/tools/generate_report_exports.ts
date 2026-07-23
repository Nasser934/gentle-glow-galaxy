import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { err, ok, sbClient } from "../shared";

const FORMATS = ["pdf", "xlsx", "pptx"] as const;

function siteOrigin(): string {
  return process.env.APP_SITE_URL ?? "https://gentle-glow-galaxy.lovable.app";
}

export default defineTool({
  name: "generate_report_exports",
  title: "Queue report exports (PDF / XLSX / PPTX)",
  description:
    "Queue one or more export jobs for a report you own. Concept AI generates the files with its own templates and export engines — external assistants must NOT upload pre-generated files. Returns a display URL where the exports are produced and downloaded.",
  inputSchema: {
    report_id: z.string().uuid().describe("Report UUID."),
    formats: z
      .array(z.enum(FORMATS))
      .min(1)
      .max(3)
      .describe("Which formats to generate: pdf, xlsx, pptx."),
    idempotency_key: z.string().min(8).max(128).describe("Unique key per export request."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ report_id, formats, idempotency_key }, ctx) => {
    if (!ctx.isAuthenticated()) return err("Not authenticated");
    const userId = ctx.getUserId();
    const sb = sbClient(ctx);

    const { data: report } = await sb
      .from("reports")
      .select("id, user_id, slug")
      .eq("id", report_id)
      .maybeSingle();
    if (!report) return err("Report not found or not accessible.");
    if (report.user_id !== userId) return err("Only the report owner can generate exports.");

    const displayUrl = `${siteOrigin()}/r/${report.slug}?export=1`;
    const rows = formats.map((format) => ({
      report_id,
      user_id: userId,
      format,
      status: "queued" as const,
      display_url: displayUrl,
      idempotency_key,
      requested_by: "mcp",
    }));

    const { data, error } = await sb
      .from("report_exports")
      .upsert(rows, { onConflict: "user_id,report_id,format,idempotency_key", ignoreDuplicates: false })
      .select("id, format, status, display_url");
    if (error) return err(error.message);

    return ok(
      `Queued ${data?.length ?? 0} export(s). Open the display URL to produce the files: ${displayUrl}`,
      { exports: data ?? [], display_url: displayUrl },
    );
  },
});
