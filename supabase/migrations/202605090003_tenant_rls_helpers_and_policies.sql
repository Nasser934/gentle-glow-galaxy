-- Phase 1 / Priority 3: Tenant helper functions, RLS policies, and tenant safety guards.
-- This migration moves the database toward tenant-scoped access control.
-- It includes a temporary compatibility trigger that fills tenant_id for existing account-based frontend writes.

begin;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------
create or replace function public.current_user_is_tenant_member(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = _tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function public.current_user_has_tenant_role(
  _tenant_id uuid,
  _roles public.tenant_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = _tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role = any(_roles)
  );
$$;

create or replace function public.storage_path_tenant_id(_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first_folder text;
begin
  v_first_folder := (storage.foldername(_name))[1];
  if v_first_folder is null then
    return null;
  end if;

  return v_first_folder::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.current_user_is_tenant_member(uuid) from public;
revoke all on function public.current_user_has_tenant_role(uuid, public.tenant_role[]) from public;
revoke all on function public.storage_path_tenant_id(text) from public;

grant execute on function public.current_user_is_tenant_member(uuid) to anon, authenticated;
grant execute on function public.current_user_has_tenant_role(uuid, public.tenant_role[]) to authenticated;
grant execute on function public.storage_path_tenant_id(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Compatibility bridge for old account-based writes.
-- Existing frontend writes reports with user_id but no tenant_id.
-- This assigns those rows to the user's deterministic personal workspace.
-- Remove this after the frontend and Edge Functions always send tenant_id.
-- -----------------------------------------------------------------------------
create or replace function public.default_personal_tenant_id(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  where t.owner_user_id = _user_id
    and t.slug = 'personal-' || replace(_user_id::text, '-', '')
  limit 1;
$$;

revoke all on function public.default_personal_tenant_id(uuid) from public;
grant execute on function public.default_personal_tenant_id(uuid) to authenticated;

create or replace function public.fill_missing_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if tg_table_name = 'reports' and new.tenant_id is null then
    new.tenant_id := public.default_personal_tenant_id(new.user_id);
  elsif tg_table_name in ('report_comments', 'report_status_history') and new.tenant_id is null then
    select r.tenant_id
    into new.tenant_id
    from public.reports r
    where r.id = new.report_id;
  elsif tg_table_name = 'notifications' and new.tenant_id is null then
    if new.report_id is not null then
      select r.tenant_id
      into new.tenant_id
      from public.reports r
      where r.id = new.report_id;
    end if;

    if new.tenant_id is null then
      new.tenant_id := public.default_personal_tenant_id(new.user_id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fill_reports_tenant_id on public.reports;
create trigger fill_reports_tenant_id
before insert on public.reports
for each row execute function public.fill_missing_tenant_id();

drop trigger if exists fill_report_comments_tenant_id on public.report_comments;
create trigger fill_report_comments_tenant_id
before insert on public.report_comments
for each row execute function public.fill_missing_tenant_id();

drop trigger if exists fill_notifications_tenant_id on public.notifications;
create trigger fill_notifications_tenant_id
before insert on public.notifications
for each row execute function public.fill_missing_tenant_id();

drop trigger if exists fill_report_status_history_tenant_id on public.report_status_history;
create trigger fill_report_status_history_tenant_id
before insert on public.report_status_history
for each row execute function public.fill_missing_tenant_id();

-- -----------------------------------------------------------------------------
-- Tenant integrity guards
-- -----------------------------------------------------------------------------
create or replace function public.prevent_tenant_id_change()
returns trigger
language plpgsql
as $$
begin
  if old.tenant_id is distinct from new.tenant_id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'tenant_id cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_report_child_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_tenant_id uuid;
begin
  if new.report_id is null then
    return new;
  end if;

  select r.tenant_id
  into v_report_tenant_id
  from public.reports r
  where r.id = new.report_id;

  if v_report_tenant_id is null then
    raise exception 'report tenant not found';
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_report_tenant_id;
  end if;

  if new.tenant_id is distinct from v_report_tenant_id then
    raise exception 'tenant_id must match report tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_reports_tenant_id_change on public.reports;
create trigger prevent_reports_tenant_id_change
before update of tenant_id on public.reports
for each row execute function public.prevent_tenant_id_change();

drop trigger if exists prevent_comments_tenant_id_change on public.report_comments;
create trigger prevent_comments_tenant_id_change
before update of tenant_id on public.report_comments
for each row execute function public.prevent_tenant_id_change();

drop trigger if exists prevent_notifications_tenant_id_change on public.notifications;
create trigger prevent_notifications_tenant_id_change
before update of tenant_id on public.notifications
for each row execute function public.prevent_tenant_id_change();

drop trigger if exists prevent_status_history_tenant_id_change on public.report_status_history;
create trigger prevent_status_history_tenant_id_change
before update of tenant_id on public.report_status_history
for each row execute function public.prevent_tenant_id_change();

drop trigger if exists prevent_report_exports_tenant_id_change on public.report_exports;
create trigger prevent_report_exports_tenant_id_change
before update of tenant_id on public.report_exports
for each row execute function public.prevent_tenant_id_change();

drop trigger if exists enforce_comments_report_tenant on public.report_comments;
create trigger enforce_comments_report_tenant
before insert or update of tenant_id, report_id on public.report_comments
for each row execute function public.enforce_report_child_tenant();

drop trigger if exists enforce_status_history_report_tenant on public.report_status_history;
create trigger enforce_status_history_report_tenant
before insert or update of tenant_id, report_id on public.report_status_history
for each row execute function public.enforce_report_child_tenant();

drop trigger if exists enforce_report_exports_report_tenant on public.report_exports;
create trigger enforce_report_exports_report_tenant
before insert or update of tenant_id, report_id on public.report_exports
for each row execute function public.enforce_report_child_tenant();

drop trigger if exists enforce_notifications_report_tenant on public.notifications;
create trigger enforce_notifications_report_tenant
before insert or update of tenant_id, report_id on public.notifications
for each row execute function public.enforce_report_child_tenant();

-- -----------------------------------------------------------------------------
-- Drop existing policies on tenant-scoped tables before creating the new model.
-- This prevents old account-based policies from bypassing tenant isolation.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tenants',
        'tenant_members',
        'subscriptions',
        'usage_events',
        'audit_logs',
        'report_exports',
        'reports',
        'report_comments',
        'notifications',
        'report_status_history'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Enable RLS
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.report_exports enable row level security;
alter table public.reports enable row level security;
alter table public.report_comments enable row level security;
alter table public.notifications enable row level security;
alter table public.report_status_history enable row level security;

-- -----------------------------------------------------------------------------
-- Tenant policies
-- -----------------------------------------------------------------------------
create policy tenants_select_member
on public.tenants
for select
to authenticated
using (public.current_user_is_tenant_member(id));

create policy tenants_update_owner_admin
on public.tenants
for update
to authenticated
using (public.current_user_has_tenant_role(id, array['owner','admin']::public.tenant_role[]))
with check (public.current_user_has_tenant_role(id, array['owner','admin']::public.tenant_role[]));

-- -----------------------------------------------------------------------------
-- Tenant member policies
-- -----------------------------------------------------------------------------
create policy tenant_members_select_member
on public.tenant_members
for select
to authenticated
using (public.current_user_is_tenant_member(tenant_id));

create policy tenant_members_insert_owner_admin
on public.tenant_members
for insert
to authenticated
with check (
  role <> 'owner'
  and public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy tenant_members_update_owner_admin
on public.tenant_members
for update
to authenticated
using (public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (
  role <> 'owner'
  and public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy tenant_members_delete_owner_admin
on public.tenant_members
for delete
to authenticated
using (
  role <> 'owner'
  and public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

-- -----------------------------------------------------------------------------
-- Report policies
-- -----------------------------------------------------------------------------
create policy reports_select_public_or_member
on public.reports
for select
to anon, authenticated
using (
  is_public = true
  or public.current_user_is_tenant_member(tenant_id)
);

create policy reports_insert_member
on public.reports
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','member']::public.tenant_role[]
  )
);

create policy reports_update_owner_admin_or_author
on public.reports
for update
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or (
    user_id = auth.uid()
    and public.current_user_has_tenant_role(tenant_id, array['member']::public.tenant_role[])
  )
)
with check (
  user_id = auth.uid()
  and public.current_user_has_tenant_role(tenant_id, array['owner','admin','member']::public.tenant_role[])
);

create policy reports_delete_owner_admin_or_author
on public.reports
for delete
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
  or user_id = auth.uid()
);

-- -----------------------------------------------------------------------------
-- Comment policies
-- -----------------------------------------------------------------------------
create policy comments_select_tenant
on public.report_comments
for select
to authenticated
using (public.current_user_is_tenant_member(tenant_id));

create policy comments_insert_member
on public.report_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','member']::public.tenant_role[]
  )
);

create policy comments_update_author_or_admin
on public.report_comments
for update
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
)
with check (
  user_id = auth.uid()
  or public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy comments_delete_author_or_admin
on public.report_comments
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

-- -----------------------------------------------------------------------------
-- Notification policies
-- -----------------------------------------------------------------------------
create policy notifications_select_own_tenant
on public.notifications
for select
to authenticated
using (
  user_id = auth.uid()
  and public.current_user_is_tenant_member(tenant_id)
);

create policy notifications_insert_own_tenant
on public.notifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_is_tenant_member(tenant_id)
);

create policy notifications_update_own_tenant
on public.notifications
for update
to authenticated
using (
  user_id = auth.uid()
  and public.current_user_is_tenant_member(tenant_id)
)
with check (
  user_id = auth.uid()
  and public.current_user_is_tenant_member(tenant_id)
);

create policy notifications_delete_own_tenant
on public.notifications
for delete
to authenticated
using (
  user_id = auth.uid()
  and public.current_user_is_tenant_member(tenant_id)
);

-- -----------------------------------------------------------------------------
-- Status history policies
-- -----------------------------------------------------------------------------
create policy status_history_select_tenant
on public.report_status_history
for select
to authenticated
using (public.current_user_is_tenant_member(tenant_id));

create policy status_history_insert_member
on public.report_status_history
for insert
to authenticated
with check (
  changed_by = auth.uid()
  and public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','member']::public.tenant_role[]
  )
);

-- -----------------------------------------------------------------------------
-- Subscription, usage, audit, and export metadata policies
-- -----------------------------------------------------------------------------
create policy subscriptions_select_owner_admin
on public.subscriptions
for select
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy usage_events_select_owner_admin
on public.usage_events
for select
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy audit_logs_select_owner_admin
on public.audit_logs
for select
to authenticated
using (
  public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

create policy report_exports_select_member
on public.report_exports
for select
to authenticated
using (public.current_user_is_tenant_member(tenant_id));

create policy report_exports_insert_member
on public.report_exports
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.current_user_has_tenant_role(
    tenant_id,
    array['owner','admin','member']::public.tenant_role[]
  )
);

create policy report_exports_delete_owner_admin_or_author
on public.report_exports
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])
);

-- -----------------------------------------------------------------------------
-- Storage policies for the private exports bucket.
-- Correct path convention inside the bucket:
--   {tenant_id}/{report_id}/{export_id}.pdf
-- -----------------------------------------------------------------------------
drop policy if exists exports_storage_select_member on storage.objects;
create policy exports_storage_select_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exports'
  and public.current_user_is_tenant_member(public.storage_path_tenant_id(name))
);

drop policy if exists exports_storage_insert_member on storage.objects;
create policy exports_storage_insert_member
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exports'
  and public.current_user_has_tenant_role(
    public.storage_path_tenant_id(name),
    array['owner','admin','member']::public.tenant_role[]
  )
);

drop policy if exists exports_storage_delete_owner_admin on storage.objects;
create policy exports_storage_delete_owner_admin
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exports'
  and public.current_user_has_tenant_role(
    public.storage_path_tenant_id(name),
    array['owner','admin']::public.tenant_role[]
  )
);

commit;
