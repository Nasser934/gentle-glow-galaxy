import { supabase } from "@/integrations/supabase/client";
import type { ConceptInputs, FeasibilityReport } from "@/types/analysis";

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
  created_at: string;
  updated_at: string;
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not signed in");
  return user;
}

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function saveReport(inputs: ConceptInputs, output: FeasibilityReport) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: user.id,
      title: inputs.projectName || "Untitled analysis",
      industry: inputs.industry || null,
      inputs: inputs as any,
      output: output as any,
      is_public: false,
    })
    .select("id, slug")
    .single();
  if (error) throw error;
  return data;
}

export async function publishReport(id: string) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("reports")
    .update({ is_public: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, slug")
    .single();
  if (error) throw error;
  return data;
}

export async function getReportBySlug(slug: string) {
  const userId = await getCurrentUserId();
  const visibilityFilter = userId
    ? `is_public.eq.true,user_id.eq.${userId}`
    : "is_public.eq.true";

  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("slug", slug)
    .or(visibilityFilter)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown) as ReportRow | null;
}

export async function listMyReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("id, slug, title, industry, status, created_at, updated_at, is_public")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function deleteReport(id: string) {
  const user = await requireUser();
  const { error } = await supabase.from("reports").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
}

export async function updateReportStatus(id: string, status: ReportRow["status"], note?: string) {
  const user = await requireUser();
  const { data: prev } = await supabase
    .from("reports")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const { error } = await supabase
    .from("reports")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  await supabase.from("report_status_history").insert({
    report_id: id, changed_by: user.id, from_status: prev?.status ?? null, to_status: status, note: note ?? null,
  });
}
