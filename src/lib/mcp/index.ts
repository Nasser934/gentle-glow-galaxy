import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listReports from "./tools/list-reports";
import getReport from "./tools/get-report";
import listComments from "./tools/list-comments";

// Direct supabase.co issuer required by mcp-js (SUPABASE_URL may be a proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "concept-ai-mcp",
  title: "Concept AI",
  version: "0.1.0",
  instructions:
    "Tools for Concept AI, an evidence-aware feasibility analysis app. Use list_reports to browse the signed-in user's analyses, get_report to fetch a full FMART-O report (by UUID, CAI display id, or share slug), and list_comments for report discussion.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listReports, getReport, listComments],
});
