alter table public.analysis_jobs
  add column if not exists policy_version text,
  add column if not exists prompt_version text,
  add column if not exists prompt_hash text,
  add column if not exists model_id text,
  add column if not exists resolved_concept jsonb;

comment on column public.analysis_jobs.resolved_concept is
  'Validated resolved-concept.v1 analytical baseline; original inputs remain unchanged in inputs.';
comment on column public.analysis_jobs.prompt_hash is
  'SHA-256 hash of the compiled prompt bundle used by this job.';

alter table public.reports
  add column if not exists prompt_version text,
  add column if not exists model_id text,
  add column if not exists report_schema_version text,
  add column if not exists source_snapshot_metadata jsonb not null default '{}'::jsonb,
  add column if not exists parent_report_id uuid references public.reports(id) on delete set null,
  add column if not exists root_report_id uuid references public.reports(id) on delete set null,
  add column if not exists save_operation_key text,
  add column if not exists source_mode text not null default 'in_app',
  add column if not exists source_schema_version text;

create unique index if not exists reports_save_operation_key_unique
  on public.reports(save_operation_key)
  where save_operation_key is not null;
create index if not exists reports_root_report_id_idx
  on public.reports(root_report_id);

drop function if exists public.can_view_report(uuid);

create or replace function public.can_view_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $$
  select exists (
    select 1
    from public.reports as report
    where report.id = p_report_id
      and (report.is_public = true or report.user_id = auth.uid())
  );
$$;

revoke all on function public.can_view_report(uuid) from public;
grant execute on function public.can_view_report(uuid) to anon, authenticated, service_role;

create table if not exists public.report_research_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  analysis_job_id uuid references public.analysis_jobs(id) on delete set null,
  policy_version text,
  prompt_version text,
  prompt_hash text,
  model_id text,
  research_quality jsonb not null default '{}'::jsonb,
  research_review jsonb not null default '{}'::jsonb,
  freshness jsonb not null default '{}'::jsonb,
  executed_queries jsonb not null default '[]'::jsonb,
  source_count integer not null default 0 check (source_count >= 0),
  unique_domain_count integer not null default 0 check (unique_domain_count >= 0),
  authoritative_source_count integer not null default 0
    check (authoritative_source_count >= 0),
  extracted_source_count integer not null default 0
    check (extracted_source_count >= 0),
  research_round_count integer not null default 0
    check (research_round_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint report_research_runs_report_id_key unique (report_id)
);

comment on table public.report_research_runs is
  'Permanent research-run metadata for a completed feasibility report.';
comment on column public.report_research_runs.executed_queries is
  'Search query plan and completion metadata; never contains provider credentials.';
comment on column public.report_research_runs.research_round_count is
  'Number of bounded research rounds completed for this report.';

create table if not exists public.report_research_sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.report_research_runs(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  normalized_url text not null,
  url text not null,
  domain text not null,
  title text not null,
  snippet text,
  content_excerpt text check (
    content_excerpt is null or char_length(content_excerpt) <= 6000
  ),
  relevance_score numeric,
  authority_score integer,
  categories text[] not null default '{}'::text[],
  query_ids text[] not null default '{}'::text[],
  published_date text,
  extracted boolean not null default false,
  extraction_attempted boolean not null default false,
  source_rank numeric,
  created_at timestamptz not null default now(),
  constraint report_research_sources_report_url_key
    unique (report_id, normalized_url)
);

comment on table public.report_research_sources is
  'Deduplicated permanent source snapshot used by a completed report.';
comment on column public.report_research_sources.content_excerpt is
  'Plain-text or markdown excerpt capped at 6,000 characters; never rendered as raw HTML.';

create index if not exists report_research_runs_report_id_idx
  on public.report_research_runs(report_id);
create index if not exists report_research_sources_report_id_idx
  on public.report_research_sources(report_id);
create index if not exists report_research_sources_run_id_idx
  on public.report_research_sources(research_run_id);
create index if not exists report_research_sources_domain_idx
  on public.report_research_sources(domain);
create index if not exists report_research_sources_authority_idx
  on public.report_research_sources(authority_score desc);
create index if not exists report_research_sources_published_date_idx
  on public.report_research_sources(published_date desc);
create index if not exists report_research_sources_categories_gin_idx
  on public.report_research_sources using gin(categories);

alter table public.report_research_runs enable row level security;
alter table public.report_research_sources enable row level security;

drop policy if exists "Viewable report research runs"
  on public.report_research_runs;
create policy "Viewable report research runs"
  on public.report_research_runs
  for select
  to anon, authenticated
  using (public.can_view_report(report_id));

drop policy if exists "Viewable report research sources"
  on public.report_research_sources;
create policy "Viewable report research sources"
  on public.report_research_sources
  for select
  to anon, authenticated
  using (public.can_view_report(report_id));

revoke all on public.report_research_runs from anon, authenticated;
revoke all on public.report_research_sources from anon, authenticated;
grant select on public.report_research_runs to anon, authenticated;
grant select on public.report_research_sources to anon, authenticated;
grant all on public.report_research_runs to service_role;
grant all on public.report_research_sources to service_role;