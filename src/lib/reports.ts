import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";
import type { Json } from "@/integrations/supabase/types";

export interface ReportRow {
  id: string;
  slug: string;
  user_id: string;
  title: string;
  industry: string | null;
  inputs: ConceptInputs;
  output: FeasibilityReport;
  status: "draft" | "in_review" | "approved" | "rejected";
  is_public: boolean;
  canonical_validated: boolean;
  legacy_report_id: string | null;
  parent_report_id: string | null;
  root_report_id: string | null;
  archived_at: string | null;
  display_id: string;
  model_id: string | null;
  prompt_version: string | null;
  scoring_engine_version: string | null;
  research_timestamp: string | null;
  source_snapshot_metadata: Record<string, unknown>;
  input_hash: string | null;
  report_schema_version: string | null;
  generation_timestamp: string | null;
  generation_seed: number | null;
  save_operation_key: string | null;
  created_at: string;
  updated_at: string;
}

function reportAuditFields(output: FeasibilityReport) {
  const quality = output.qualityMetadata;
  return {
    model_id: quality?.modelId ?? null,
    prompt_version: quality?.promptVersion ?? null,
    scoring_engine_version: quality?.scoringEngineVersion ?? output.scoringAudit?.scoringEngineVersion ?? null,
    research_timestamp: quality?.researchTimestamp ?? null,
    source_snapshot_metadata: {
      sourceCount: output.sources?.length ?? 0,
      sources: (output.sources ?? []).map((source) => ({
        sourceId: source.sourceId,
        url: source.url,
        publicationDate: source.publicationDate ?? null,
        accessDate: source.accessDate,
        quality: source.quality,
      })),
    },
    input_hash: quality?.inputHash ?? null,
    report_schema_version: output.reportSchemaVersion ?? quality?.reportSchemaVersion ?? null,
    generation_timestamp: quality?.generationTimestamp ?? null,
  };
}

type SavedReport = { id: string; slug: string; displayId: string; report: FeasibilityReport };

async function recoverIdempotentSave(userId: string, saveOperationKey: string): Promise<SavedReport | null> {
  const { data, error } = await supabase
    .from("reports")
    .select("id, slug, display_id, output")
    .eq("user_id", userId)
    .eq("save_operation_key", saveOperationKey)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    slug: data.slug,
    displayId: data.display_id,
    report: data.output as unknown as FeasibilityReport,
  };
}

export async function saveReport(
  inputs: ConceptInputs,
  output: FeasibilityReport,
  saveOperationKey = crypto.randomUUID(),
): Promise<SavedReport> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: inputs.projectName || "Untitled analysis",
      industry: inputs.industry || null,
      inputs: inputs as unknown as Json,
      output: output as unknown as Json,
      save_operation_key: saveOperationKey,
      ...reportAuditFields(output),
    })
    .select("id, slug, display_id, output")
    .single();
  if (error) {
    const existing = await recoverIdempotentSave(user.id, saveOperationKey);
    if (existing) return existing;
    console.error(JSON.stringify({ event: "report_save_failed", category: error.code || "database" }));
    throw error;
  }
  console.info(JSON.stringify({ event: "report_save_completed", reportId: data.id, reportSchemaVersion: output.reportSchemaVersion ?? "legacy" }));
  return {
    id: data.id,
    slug: data.slug,
    displayId: data.display_id,
    report: data.output as unknown as FeasibilityReport,
  };
}

/**
 * Save a re-run as a NEW row linked to the original/root report.
 * If the supplied parent is itself a child version, we walk up to the root so
 * the version chain stays flat (root -> v2, root -> v3, …).
 */
export async function saveRerunReport(params: {
  parentReportId: string;
  inputs: ConceptInputs;
  report: FeasibilityReport;
  saveOperationKey?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  // Ownership: walk to the root and verify the signed-in user owns it.
  const rootId = await getReportRootId(params.parentReportId);
  const root = await getReportWithOwnership(rootId);
  if (!root) throw new Error("Original report not found.");
  if (root.user_id !== user.id) {
    throw new Error("Only the report owner can create a new version.");
  }
  const saveOperationKey = params.saveOperationKey ?? crypto.randomUUID();

  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: params.inputs.projectName || "Untitled analysis",
      industry: params.inputs.industry || null,
      inputs: params.inputs as unknown as Json,
      output: params.report as unknown as Json,
      parent_report_id: rootId,
      save_operation_key: saveOperationKey,
      ...reportAuditFields(params.report),
    })
    .select("id, slug, display_id, output")
    .single();
  if (error) {
    const existing = await recoverIdempotentSave(user.id, saveOperationKey);
    if (existing) return existing;
    console.error(JSON.stringify({ event: "report_version_save_failed", category: error.code || "database" }));
    throw error;
  }
  console.info(JSON.stringify({ event: "report_version_save_completed", reportId: data.id, parentReportId: rootId, reportSchemaVersion: params.report.reportSchemaVersion ?? "legacy" }));
  return {
    id: data.id,
    slug: data.slug,
    displayId: data.display_id,
    report: data.output as unknown as FeasibilityReport,
  };
}

/** Back-compat shim. */
export async function saveReportVersion(inputs: ConceptInputs, output: FeasibilityReport) {
  return saveReport(inputs, output);
}

export async function getReportBySlug(slug: string) {
  const { data, error } = await supabase
    .rpc("get_report_by_slug", { p_slug: slug })
    .maybeSingle();
  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

export async function getReportById(id: string) {
  const { data, error } = await supabase
    .from("reports").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

/** Returns ownership info without leaking the full payload — safe to call for permission checks. */
export async function getReportWithOwnership(id: string) {
  const { data, error } = await supabase
    .from("reports").select("id, user_id, parent_report_id, slug, is_public").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as { id: string; user_id: string; parent_report_id: string | null; slug: string; is_public: boolean } | null;
}

/**
 * Change visibility only after verifying the authenticated owner. The update
 * is also protected by reports RLS; the explicit user_id filter prevents a
 * successful-looking no-op when a non-owner attempts the request.
 */
export async function setReportVisibility(id: string, isPublic: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to manage sharing.");

  const { data, error } = await supabase
    .from("reports")
    .update({ is_public: isPublic })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, slug, is_public")
    .maybeSingle();

  if (error) throw error;
  if (!data || data.is_public !== isPublic) {
    throw new Error("Visibility was not updated. Only the report owner can manage sharing.");
  }
  return data as { id: string; slug: string; is_public: boolean };
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
    .select("id, slug, title, created_at, parent_report_id, user_id")
    .or(`id.eq.${rootId},parent_report_id.eq.${rootId}`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type ReportScope = "active" | "archived" | "all";

export async function listMyReports(scope: ReportScope = "active") {
  let q = supabase
    .from("reports")
    .select("id, slug, title, industry, status, created_at, updated_at, parent_report_id, archived_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (scope === "active") q = q.is("archived_at", null);
  else if (scope === "archived") q = q.not("archived_at", "is", null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
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
    .update({ archived_at: now })
    .eq("id", rootId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("reports")
    .update({ archived_at: now })
    .eq("parent_report_id", rootId);
  if (e2) throw e2;
}

/** Restore a whole project group. Owner only via RLS. */
export async function restoreReportGroup(reportId: string) {
  const rootId = await getReportRootId(reportId);
  const { error: e1 } = await supabase
    .from("reports")
    .update({ archived_at: null })
    .eq("id", rootId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("reports")
    .update({ archived_at: null })
    .eq("parent_report_id", rootId);
  if (e2) throw e2;
}

export async function updateReportStatus(id: string, status: ReportRow["status"]) {
  const { data, error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== status) {
    throw new Error("Status was not updated. Only the report owner can change it.");
  }
  return data;
}
