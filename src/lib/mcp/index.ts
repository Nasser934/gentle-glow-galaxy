import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listReports from "./tools/list_reports";
import getReport from "./tools/get_report";
import listComments from "./tools/list_comments";
import addComment from "./tools/add_comment";
import setReportStatus from "./tools/set_report_status";
import getAnalysisSchema from "./tools/get_analysis_schema";
import validateExternalAnalysis from "./tools/validate_external_analysis";
import createExternalAnalysis from "./tools/create_external_analysis";
import updateExternalAnalysis from "./tools/update_external_analysis";
import generateReportExports from "./tools/generate_report_exports";
import getExportStatus from "./tools/get_export_status";
import listReportExports from "./tools/list_report_exports";
import getReportDisplayLink from "./tools/get_report_display_link";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "concept-ai-mcp",
  title: "Concept AI",
  version: "0.2.0",
  instructions:
    "Concept AI feasibility analysis (FMART-O). External assistants may research the web and submit completed analysis JSON via create_external_analysis / update_external_analysis (use get_analysis_schema first, then validate_external_analysis). Concept AI owns all validation, canonical FMART-O scoring, financial totals, dashboards, charts, versioning, and export file generation (PDF/XLSX/PPTX). Do NOT generate or upload PDF/Excel/PowerPoint files — use generate_report_exports to queue Concept AI's export engine and get_report_display_link to point the user to the produced files. Existing tools: list_reports, get_report, list_comments, add_comment, set_report_status.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listReports,
    getReport,
    listComments,
    addComment,
    setReportStatus,
    getAnalysisSchema,
    validateExternalAnalysis,
    createExternalAnalysis,
    updateExternalAnalysis,
    generateReportExports,
    getExportStatus,
    listReportExports,
    getReportDisplayLink,
  ],
});
