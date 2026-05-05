-- Report sharing and ownership performance hardening.
-- Review existing indexes/constraints before applying to a live Supabase project.

-- Slugs should be unique because /r/:slug resolves one report.
create unique index if not exists reports_slug_unique_idx
on public.reports (slug);

-- Owner dashboard and owner-scoped mutations.
create index if not exists reports_user_created_idx
on public.reports (user_id, created_at desc);

-- Public-by-link lookups.
create index if not exists reports_public_slug_idx
on public.reports (slug)
where is_public = true;

-- Comments loading by report.
create index if not exists report_comments_report_created_idx
on public.report_comments (report_id, created_at asc);

-- Status audit history by report.
create index if not exists report_status_history_report_created_idx
on public.report_status_history (report_id, created_at desc);

-- Defensive status constraint. Compatible with text or enum columns.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reports_status_allowed_chk'
  ) then
    alter table public.reports
    add constraint reports_status_allowed_chk
    check (status::text in ('draft', 'in_review', 'approved', 'rejected'));
  end if;
end $$;
