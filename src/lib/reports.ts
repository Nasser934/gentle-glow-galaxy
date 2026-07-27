import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import {
  versionFamilyFilter,
  versionLinksForParent,
} from "@/lib/reportVersioning";

export interface ReportRow {
  id: string;
  display_id?: string | null;
  slug: string;
  user_id: string;
  title: string;
  industry: string | null;
  inputs: ConceptInputs;
  output: FeasibilityReport;
  status: "draft" | "in_review" | "approved" | "rejected";
  is_public: boolean;
  parent_report_id: string | null;
  root_report_id?: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  source_mode?: "in_app" | "external_agent";
  external_agent_metadata?: Record<string, unknown>;
}

const REPORT_ROW_COLUMNS = [
  "id",
  "display_id",
  "slug",
  "user_id",
  "title",
  "industry",
  "inputs",
  "output",
  "status",
  "is_public",
  "parent_report_id",
  "root_report_id",
  "archived_at",
  "created_at",
  "updated_at",
  "source_mode",
].join(", ");

export async function saveReport(inputs: ConceptInputs, output: FeasibilityReport) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: inputs.projectName || "Untitled analysis",
      industry: inputs.industry || null,
      inputs: inputs as any,
      output: output as any,
    })
    .select("id, slug")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Save a re-run as a NEW row linked to its immediate parent and family root.
 */
export async function saveRerunReport(params: {
  parentReportId: string;
  inputs: ConceptInputs;
  report: FeasibilityReport;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const parent = await getReportWithOwnership(params.parentReportId);
  if (!parent) throw new Error("Original report not found.");
  if (parent.user_id !== user.id) {
    throw new Error("Only the report owner can create a new version.");
  }
  const links = versionLinksForParent(parent);

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: params.inputs.projectName || "Untitled analysis",
      industry: params.inputs.industry || null,
      inputs: params.inputs as any,
      output: params.report as any,
      parent_report_id: links.parentReportId,
      root_report_id: links.rootReportId,
    } as any)
    .select("id, slug")
    .single();
  if (error) throw error;
  return data;
}

/** Back-compat shim. */
export async function saveReportVersion(inputs: ConceptInputs, output: FeasibilityReport) {
  return saveReport(inputs, output);
}

export async function getReportBySlug(slug: string) {
  const { data, error } = await supabase
    .from("reports").select(REPORT_ROW_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

export async function getReportById(id: string) {
  const { data, error } = await supabase
    .from("reports").select(REPORT_ROW_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

/** Returns ownership info without leaking the full payload — safe to call for permission checks. */
export async function getReportWithOwnership(id: string) {
  const { data, error } = await supabase
    .from("reports")
    .select("id, user_id, parent_report_id, root_report_id, slug, is_public")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    user_id: string;
    parent_report_id: string | null;
    root_report_id?: string | null;
    slug: string;
    is_public: boolean;
  } | null;
}

/**
 * Walk to the root of the version chain. Loops up parent_report_id with
 * a max-depth guard (10) and a visited-set to defend against cycles.
 */
export async function getReportRootId(reportId: string): Promise<string> {
  const visited = new Set<string>();
  let currentId = reportId;
  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) return currentId; // cycle guard
    visited.add(currentId);
    const row = await getReportWithOwnership(currentId);
    if (!row) return currentId;
    if (row.root_report_id) return row.root_report_id;
    if (!row.parent_report_id || row.parent_report_id === row.id) return row.id;
    currentId = row.parent_report_id;
  }
  return currentId; // depth cap reached — treat as root
}

/** List the root and every child version, ordered oldest -> newest. */
export async function listReportVersions(reportId: string) {
  const rootId = await getReportRootId(reportId);
  const { data, error } = await supabase
    .from("reports")
    .select("id, slug, title, created_at, parent_report_id, root_report_id, user_id")
    .or(versionFamilyFilter(rootId))
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ReportScope = "active" | "archived" | "all";

export async function listMyReports(scope: ReportScope = "active") {
  let q = supabase
    .from("reports")
    .select("id, slug, title, industry, status, created_at, updated_at, parent_report_id, archived_at" as any)
    .order("created_at", { ascending: false })
    .limit(200);
  if (scope === "active") q = q.is("archived_at" as any, null);
  else if (scope === "archived") q = q.not("archived_at" as any, "is", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any[];
}

export async function deleteReport(id: string) {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) throw error;
}

/** Archive a whole project group (root + all child versions). Owner only via RLS. */
export async function archiveReportGroup(reportId: string) {
  const rootId = await getReportRootId(reportId);
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from("reports")
    .update({ archived_at: now } as any)
    .eq("id", rootId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("reports")
    .update({ archived_at: now } as any)
    .or(`root_report_id.eq.${rootId},parent_report_id.eq.${rootId}`);
  if (e2) throw e2;
}

/** Restore a whole project group. Owner only via RLS. */
export async function restoreReportGroup(reportId: string) {
  const rootId = await getReportRootId(reportId);
  const { error: e1 } = await supabase
    .from("reports")
    .update({ archived_at: null } as any)
    .eq("id", rootId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("reports")
    .update({ archived_at: null } as any)
    .or(`root_report_id.eq.${rootId},parent_report_id.eq.${rootId}`);
  if (e2) throw e2;
}

export async function updateReportStatus(id: string, status: ReportRow["status"], note?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: prev } = await supabase.from("reports").select("status").eq("id", id).single();
  const { error } = await supabase.from("reports").update({ status }).eq("id", id);
  if (error) throw error;
  await supabase.from("report_status_history").insert({
    report_id: id, changed_by: user.id, from_status: prev?.status ?? null, to_status: status, note: note ?? null,
  });
}

/**
 * One-time self-heal for legacy external-agent rows that still store the raw
 * MCP payload. Writes the deterministically normalized canonical report back
 * to the row (owner-only, enforced by RLS). Never invents values.
 */
export async function persistCanonicalRepair(params: {
  reportId: string;
  inputs: ConceptInputs;
  output: FeasibilityReport;
  warnings: string[];
  originalInputs: unknown;
  originalOutput: unknown;
}) {
  const { error } = await supabase
    .from("reports")
    .update({
      inputs: params.inputs as unknown as never,
      output: params.output as unknown as never,
      original_payload: {
        inputs: params.originalInputs,
        analysis: params.originalOutput,
      } as unknown as never,
      normalization_warnings: params.warnings as unknown as never,
      normalization_timestamp: new Date().toISOString(),
      source_schema_version: "external_agent.v1",
      canonical_schema_version: "canonical_report.v2",
      canonical_validated: true,
    })
    .eq("id", params.reportId);
  if (error) throw error;
}
