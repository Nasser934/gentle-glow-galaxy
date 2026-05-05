-- Harden report visibility and ownership rules.
-- Review existing policies before applying this migration in Supabase.
-- If policy names already exist, drop or rename the existing policies first.

alter table public.reports enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_status_history enable row level security;

-- Reports: owners can read their reports. Public reports can be read by anyone with the slug.
create policy "reports_select_owner_or_public"
on public.reports
for select
using (
  is_public = true
  or auth.uid() = user_id
);

-- Reports: signed-in users can create only their own reports.
create policy "reports_insert_own"
on public.reports
for insert
with check (auth.uid() = user_id);

-- Reports: owners can update only their reports.
create policy "reports_update_own"
on public.reports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Reports: owners can delete only their reports.
create policy "reports_delete_own"
on public.reports
for delete
using (auth.uid() = user_id);

-- Comments: visible when the parent report is visible to the current requester.
create policy "report_comments_select_when_report_visible"
on public.report_comments
for select
using (
  exists (
    select 1
    from public.reports r
    where r.id = report_comments.report_id
      and (r.is_public = true or r.user_id = auth.uid())
  )
);

-- Comments: signed-in users can comment only as themselves on visible reports.
create policy "report_comments_insert_self_when_report_visible"
on public.report_comments
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.reports r
    where r.id = report_comments.report_id
      and (r.is_public = true or r.user_id = auth.uid())
  )
);

-- Status history: visible only to the report owner.
create policy "report_status_history_select_owner"
on public.report_status_history
for select
using (
  exists (
    select 1
    from public.reports r
    where r.id = report_status_history.report_id
      and r.user_id = auth.uid()
  )
);

-- Status history: the actor can insert history only for reports they own.
create policy "report_status_history_insert_owner"
on public.report_status_history
for insert
with check (
  auth.uid() = changed_by
  and exists (
    select 1
    from public.reports r
    where r.id = report_status_history.report_id
      and r.user_id = auth.uid()
  )
);
