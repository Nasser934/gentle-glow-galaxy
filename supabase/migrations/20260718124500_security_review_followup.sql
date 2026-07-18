-- Follow-up hardening from the hackathon readiness security review.
-- This migration is additive and preserves existing report and activity data.

-- Canonical JSON is mandatory for every newly inserted/updated report. The
-- explicit COALESCE prevents SQL's three-valued CHECK behavior from allowing
-- a missing overall score through as NULL.
alter table public.reports
  drop constraint if exists reports_canonical_output_check;
alter table public.reports
  add constraint reports_canonical_output_check check (
    not canonical_validated
    or (
      coalesce(jsonb_typeof(output -> 'scores' -> 'overall') = 'number', false)
      and output ? 'scoringAudit'
      and output ? 'reportSchemaVersion'
    )
  ) not valid;

-- Notification rows and status history are trigger-owned. Users may only
-- mark their own notifications read/unread; they cannot fabricate audit data.
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.report_status_history from anon, authenticated;

-- Table privileges and RLS are separate gates in PostgreSQL. Make the final
-- API surface explicit so a clean Supabase project behaves exactly like the
-- existing hosted project without relying on dashboard-created grants.
revoke all on table public.reports from anon, authenticated;
grant select, insert, update, delete on table public.reports to authenticated;

revoke all on table public.report_comments from anon, authenticated;
grant select on table public.report_comments to anon;
grant select, insert, delete on table public.report_comments to authenticated;

revoke all on table public.report_status_history from anon, authenticated;
grant select on table public.report_status_history to anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update on table public.profiles to authenticated;

revoke all on table public.user_roles from anon, authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;

revoke all on table public.notifications from anon, authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- Status history is derived from the actual report update. Clients cannot
-- fabricate an audit entry that does not correspond to a real transition.
alter table public.report_status_history
  add column if not exists change_source text not null default 'user';

alter table public.report_status_history
  drop constraint if exists report_status_history_change_source_check;
alter table public.report_status_history
  add constraint report_status_history_change_source_check
  check (change_source in ('user', 'system')) not valid;

drop policy if exists "Owner or admin records status changes" on public.report_status_history;
drop policy if exists "Owners and admins record status changes" on public.report_status_history;
drop policy if exists "Admins record status changes" on public.report_status_history;

create or replace function public.record_report_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if old.status is distinct from new.status then
    insert into public.report_status_history (
      report_id, changed_by, from_status, to_status, change_source
    ) values (
      new.id,
      coalesce(v_actor, new.user_id),
      old.status,
      new.status,
      case when v_actor is null then 'system' else 'user' end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_report_status_change on public.reports;
create trigger trg_record_report_status_change
after update of status on public.reports
for each row
when (old.status is distinct from new.status)
execute function public.record_report_status_change();

revoke execute on function public.record_report_status_change() from public, anon, authenticated;

create index if not exists report_status_history_report_created_idx
  on public.report_status_history(report_id, created_at desc);
create index if not exists report_comments_report_created_idx
  on public.report_comments(report_id, created_at);

-- The visible report ID comes from the database-backed sequence, not from a
-- random model/Edge value. Preserve the previous display value for audit.
alter table public.reports
  add column if not exists legacy_report_id text;

update public.reports
set legacy_report_id = output ->> 'reportId'
where legacy_report_id is null
  and nullif(output ->> 'reportId', '') is not null
  and output ->> 'reportId' is distinct from display_id;

create or replace function public.sync_report_display_id()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.display_id is not null then
    if new.legacy_report_id is null
       and nullif(new.output ->> 'reportId', '') is not null
       and new.output ->> 'reportId' is distinct from new.display_id then
      new.legacy_report_id := new.output ->> 'reportId';
    end if;
    new.output := jsonb_set(coalesce(new.output, '{}'::jsonb), '{reportId}', to_jsonb(new.display_id), true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_report_display_id on public.reports;
create trigger trg_sync_report_display_id
before insert or update of output, display_id on public.reports
for each row execute function public.sync_report_display_id();

update public.reports
set output = jsonb_set(output, '{reportId}', to_jsonb(display_id), true)
where canonical_validated = true
  and output ->> 'reportId' is distinct from display_id;

revoke execute on function public.sync_report_display_id() from public, anon, authenticated;

-- Harden every SECURITY DEFINER helper with a fixed search path and fully
-- qualified relations. Trigger-only functions remain non-callable by clients.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select _user_id = auth.uid()
    and exists (
      select 1 from public.user_roles
      where user_id = _user_id and role = _role
    );
$$;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (user_id) do nothing;
  insert into public.user_roles (user_id, role)
  values (new.id, 'user'::public.app_role)
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r_owner uuid;
  r_title text;
  r_slug text;
begin
  select user_id, title, slug
  into r_owner, r_title, r_slug
  from public.reports
  where id = new.report_id;

  if r_owner is not null and r_owner <> new.user_id then
    insert into public.notifications (user_id, report_id, actor_id, kind, title, body, url)
    values (
      r_owner,
      new.report_id,
      new.user_id,
      'comment',
      'New comment on ' || coalesce(r_title, 'your report'),
      substring(new.body from 1 for 240),
      '/r/' || r_slug
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_on_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r_owner uuid;
  r_title text;
  r_slug text;
begin
  select user_id, title, slug
  into r_owner, r_title, r_slug
  from public.reports
  where id = new.report_id;

  if r_owner is not null and r_owner <> new.changed_by then
    insert into public.notifications (user_id, report_id, actor_id, kind, title, body, url)
    values (
      r_owner,
      new.report_id,
      new.changed_by,
      'status',
      'Status changed to ' || new.to_status || ' on ' || coalesce(r_title, 'your report'),
      new.note,
      '/r/' || r_slug
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;
revoke execute on function public.notify_on_status() from public, anon, authenticated;

-- New records must reference real users. NOT VALID preserves any historical
-- rows while enforcing integrity for every insert/update after this migration.
alter table public.profiles
  add constraint profiles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table public.user_roles
  add constraint user_roles_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table public.reports
  add constraint reports_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table public.report_comments
  add constraint report_comments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table public.notifications
  add constraint notifications_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;
alter table public.notifications
  add constraint notifications_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null not valid;
