import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listReports from "./tools/list_reports";
import getReport from "./tools/get_report";
import listComments from "./tools/list_comments";
import addComment from "./tools/add_comment";
import setReportStatus from "./tools/set_report_status";

// Build the OAuth issuer from the project ref (inlined by Vite at build time,
// import-safe for the manifest-extract eval).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "concept-ai-mcp",
  title: "Concept AI",
  version: "0.1.0",
  instructions:
    "Tools for Concept AI (FMART-O feasibility analysis). Use list_reports to browse the user's reports, get_report to read one in full, list_comments/add_comment to collaborate, and set_report_status to move a report through draft → in_review → approved / rejected / archived.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listReports, getReport, listComments, addComment, setReportStatus],
});
