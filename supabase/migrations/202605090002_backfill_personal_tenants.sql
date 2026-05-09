-- Phase 1 / Priority 2: Backfill existing account-based data into personal tenants.
-- This migration keeps the current app working while preparing the data for tenant-scoped RLS.

begin;

-- -----------------------------------------------------------------------------
-- Create one personal workspace for every existing auth user.
-- Slug format is deterministic, so the migration is safe to re-run.
-- -----------------------------------------------------------------------------
insert into public.tenants (
  name,
  slug,
  tenant_type,
  owner_user_id,
  region_code,
  data_residency
)
select
  coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Personal Workspace') || '''s Workspace',
  'personal-' || replace(u.id::text, '-', ''),
  'personal',
  u.id,
  'SA',
  'supabase-shared'
from auth.users u
left join public.profiles p on p.user_id = u.id
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Make each user the owner of their personal workspace.
-- -----------------------------------------------------------------------------
insert into public.tenant_members (
  tenant_id,
  user_id,
  role,
  status
)
select
  t.id,
  t.owner_user_id,
  'owner',
  'active'
from public.tenants t
where t.slug like 'personal-%'
on conflict (tenant_id, user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Backfill reports to the user's personal tenant.
-- -----------------------------------------------------------------------------
update public.reports r
set tenant_id = t.id
from public.tenants t
where r.tenant_id is null
  and r.user_id = t.owner_user_id
  and t.slug = 'personal-' || replace(r.user_id::text, '-', '');

-- -----------------------------------------------------------------------------
-- Backfill report child records from their parent report.
-- -----------------------------------------------------------------------------
update public.report_comments c
set tenant_id = r.tenant_id
from public.reports r
where c.tenant_id is null
  and c.report_id = r.id
  and r.tenant_id is not null;

update public.report_status_history h
set tenant_id = r.tenant_id
from public.reports r
where h.tenant_id is null
  and h.report_id = r.id
  and r.tenant_id is not null;

-- -----------------------------------------------------------------------------
-- Backfill notifications.
-- Prefer the report tenant when a notification is linked to a report.
-- Otherwise use the user's personal tenant.
-- -----------------------------------------------------------------------------
update public.notifications n
set tenant_id = coalesce(
  (
    select r.tenant_id
    from public.reports r
    where r.id = n.report_id
    limit 1
  ),
  (
    select t.id
    from public.tenants t
    where t.owner_user_id = n.user_id
      and t.slug = 'personal-' || replace(n.user_id::text, '-', '')
    limit 1
  )
)
where n.tenant_id is null;

-- -----------------------------------------------------------------------------
-- Create default starter trial subscriptions for all tenants that do not have one.
-- -----------------------------------------------------------------------------
insert into public.subscriptions (
  tenant_id,
  plan,
  status,
  billing_provider
)
select
  t.id,
  'starter',
  'trialing',
  'manual'
from public.tenants t
where not exists (
  select 1
  from public.subscriptions s
  where s.tenant_id = t.id
);

commit;

-- Post-migration checks to run manually before the next contract step:
-- select count(*) as reports_without_tenant from public.reports where tenant_id is null;
-- select count(*) as comments_without_tenant from public.report_comments where tenant_id is null;
-- select count(*) as notifications_without_tenant from public.notifications where tenant_id is null;
-- select count(*) as status_history_without_tenant from public.report_status_history where tenant_id is null;
