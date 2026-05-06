-- Admin-only report monitoring support.
-- Consumer reports stay separate from system-owner monitoring details.

create table if not exists public.report_qa_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null,
  report_quality_score numeric,
  qa_status text not null check (qa_status in ('Pass', 'Warning', 'Needs repair', 'Failed')),
  report_type text not null,
  template_confidence numeric,
  evidence_coverage numeric,
  fallback_used boolean not null default false,
  repair_attempts int not null default 0,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_qa_results_report_created_idx
on public.report_qa_results (report_id, created_at desc);

create index if not exists report_qa_results_status_created_idx
on public.report_qa_results (qa_status, created_at desc);

alter table public.report_qa_results enable row level security;

drop policy if exists "report_qa_results_select_admin" on public.report_qa_results;
drop policy if exists "report_qa_results_insert_admin" on public.report_qa_results;
drop policy if exists "report_qa_results_update_admin" on public.report_qa_results;
drop policy if exists "report_qa_results_delete_admin" on public.report_qa_results;
drop policy if exists "reports_select_admin" on public.reports;

create policy "report_qa_results_select_admin"
on public.report_qa_results
for select
using (public.has_role(auth.uid(), 'admin'));

create policy "report_qa_results_insert_admin"
on public.report_qa_results
for insert
with check (public.has_role(auth.uid(), 'admin'));

create policy "report_qa_results_update_admin"
on public.report_qa_results
for update
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "report_qa_results_delete_admin"
on public.report_qa_results
for delete
using (public.has_role(auth.uid(), 'admin'));

-- Allows the admin monitoring console to review all reports.
-- Regular users are still covered by the owner/public policies from the earlier RLS migration.
create policy "reports_select_admin"
on public.reports
for select
using (public.has_role(auth.uid(), 'admin'));
