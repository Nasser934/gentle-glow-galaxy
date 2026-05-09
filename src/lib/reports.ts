import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

export interface ReportRow {
  id: string;
  slug: string;
  user_id: string;
  tenant_id?: string | null;
  title: string;
  industry: string | null;
  inputs: ConceptInputs;
  output: FeasibilityReport;
  status: "draft" | "in_review" | "approved" | "rejected";
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export async function saveReport(inputs: ConceptInputs, output: FeasibilityReport, tenantId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const payload: Record<string, unknown> = {
    user_id: user.id,
    title: inputs.projectName || "Untitled analysis",
    industry: inputs.industry || null,
    inputs: inputs as any,
    output: output as any,
  };

  if (tenantId) payload.tenant_id = tenantId;

  const { data, error } = await (supabase as any)
    .from("reports")
    .insert(payload)
    .select("id, slug")
    .single();

  if (error) throw error;
  return data;
}

export async function getReportBySlug(slug: string) {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

export async function getTenantReportById(tenantId: string, reportId: string) {
  const { data, error } = await (supabase as any)
    .from("reports")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

export async function listMyReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("id, slug, title, industry, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function listTenantReports(tenantId: string) {
  const { data, error } = await (supabase as any)
    .from("reports")
    .select("id, slug, title, industry, status, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function deleteReport(id: string) {
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) throw error;
}

export async function updateReportStatus(id: string, status: ReportRow["status"], note?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: prev } = await supabase.from("reports").select("status").eq("id", id).single();
  const { error } = await supabase.from("reports").update({ status }).eq("id", id);
  if (error) throw error;

  await supabase.from("report_status_history").insert({
    report_id: id,
    changed_by: user.id,
    from_status: prev?.status ?? null,
    to_status: status,
    note: note ?? null,
  });
}
