import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { validateCanonicalReportData } from "../../reportContract";
import {
  err,
  ok,
  reportDisplayPath,
  sbClient,
  validationErrorResult,
} from "../shared";

const FORMATS = ["pdf", "xlsx", "pptx"] as const;
const MAX_EXPORT_REPORT_BYTES = 512 * 1024;
const exportPreflightSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  slug: z.string().nullable(),
  is_public: z.boolean(),
  source_mode: z.enum(["in_app", "external_agent"]),
  canonical_validated: z.boolean(),
  payload_bytes: z.union([z.number(), z.string()]),
});

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

    const { data: preflightData, error: preflightError } = await sb
      .rpc("get_report_export_preflight", { _report_id: report_id })
      .maybeSingle();
    if (preflightError) return err(preflightError.message);
    if (!preflightData) return err("Report not found or not accessible.");
    const parsedPreflight = exportPreflightSchema.safeParse(preflightData);
    if (!parsedPreflight.success) return err("Report export preflight returned invalid data.");
    const preflight = parsedPreflight.data;
    if (preflight.user_id !== userId) return err("Only the report owner can generate exports.");
    if (
      preflight.source_mode === "external_agent"
      && preflight.canonical_validated !== true
    ) {
      return err("Report data is incompatible: canonical validation is required.");
    }
    const payloadBytes = Number(preflight.payload_bytes);
    if (!Number.isFinite(payloadBytes) || payloadBytes > MAX_EXPORT_REPORT_BYTES) {
      return err(
        `Report data is incompatible: stored payload exceeds ${MAX_EXPORT_REPORT_BYTES} bytes.`,
      );
    }

    const { data: report, error: reportError } = await sb
      .from("reports")
      .select("inputs, output")
      .eq("id", report_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (reportError) return err(reportError.message);
    if (!report) return err("Report not found or not accessible.");
    const compatibility = validateCanonicalReportData(report.inputs, report.output);
    if (!compatibility.valid) return validationErrorResult(compatibility.issues);

    const displayUrl = `${siteOrigin()}${reportDisplayPath(preflight)}?export=1`;
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
