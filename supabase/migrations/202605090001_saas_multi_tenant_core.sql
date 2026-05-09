-- Phase 1 / Priority 1: SaaS multi-tenant foundation
-- Safe expand migration only.
-- This adds new SaaS tables, nullable tenant_id columns, indexes, and the private exports bucket.
-- It does NOT enable strict tenant RLS yet, because the current frontend still writes reports without tenant_id.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- SaaS enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.tenant_role as enum ('owner', 'admin', 'member', 'viewer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tenant_type as enum ('personal', 'business', 'enterprise');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.tenant_status as enum ('active', 'suspended', 'deleted');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_plan as enum ('starter', 'pro', 'business', 'enterprise');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.billing_provider as enum ('stripe', 'tap', 'manual');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.usage_event_type as enum (
    'analysis_run',
    'autofill',
    'field_completion',
    'tavily_search',
    'ai_tokens',
    'export_pdf',
    'export_pptx',
    'export_xlsx'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.export_file_type as enum ('pdf', 'pptx', 'xlsx');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Core tenant tables
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tenant_type public.tenant_type not null default 'personal',
  status public.tenant_status not null default 'active',
  owner_user_id uuid not null,
  region_code text not null default 'SA',
  data_residency text not null default 'supabase-shared',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  role public.tenant_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  invited_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan public.subscription_plan not null default 'starter',
  status public.subscription_status not null default 'trialing',
  billing_provider public.billing_provider not null default 'manual',
  provider_customer_id text null,
  provider_subscription_id text null,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  limits jsonb not null default jsonb_build_object(
    'analysis_runs_monthly', 10,
    'field_completions_monthly', 50,
    'exports_monthly', 20,
    'members', 3
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid null,
  event_type public.usage_event_type not null,
  quantity integer not null default 1 check (quantity > 0),
  provider text null,
  provider_request_id text null,
  idempotency_key text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, event_type, idempotency_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  actor_user_id uuid null,
  action text not null,
  table_name text not null,
  record_id uuid null,
  old_data jsonb null,
  new_data jsonb null,
  ip_address inet null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null,
  file_type public.export_file_type not null,
  bucket text not null default 'exports',
  storage_path text not null,
  byte_size bigint null,
  checksum text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  unique (storage_path)
);

comment on table public.report_exports is 'Private export file metadata. Storage path convention: {tenant_id}/{report_id}/{export_id}.{pdf|pptx|xlsx}. The bucket itself is named exports.';
comment on column public.report_exports.storage_path is 'Path inside the exports bucket. Do not prefix with exports/. Use {tenant_id}/{report_id}/{export_id}.{ext}.';

-- -----------------------------------------------------------------------------
-- Expand existing business tables with nullable tenant_id.
-- These stay nullable until backfill and frontend/Edge Function updates are complete.
-- -----------------------------------------------------------------------------
alter table public.reports
  add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;

alter table public.report_comments
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

alter table public.notifications
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

alter table public.report_status_history
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_tenants_owner_user_id on public.tenants(owner_user_id);
create index if not exists idx_tenants_slug on public.tenants(slug);
create index if not exists idx_tenant_members_user_id on public.tenant_members(user_id);
create index if not exists idx_tenant_members_tenant_id on public.tenant_members(tenant_id);
create index if not exists idx_subscriptions_tenant_id on public.subscriptions(tenant_id);
create index if not exists idx_reports_tenant_created on public.reports(tenant_id, created_at desc);
create index if not exists idx_comments_tenant_report on public.report_comments(tenant_id, report_id);
create index if not exists idx_notifications_tenant_user on public.notifications(tenant_id, user_id, created_at desc);
create index if not exists idx_status_history_tenant_report on public.report_status_history(tenant_id, report_id);
create index if not exists idx_usage_events_tenant_month on public.usage_events(tenant_id, event_type, created_at desc);
create index if not exists idx_audit_logs_tenant_created on public.audit_logs(tenant_id, created_at desc);
create index if not exists idx_report_exports_tenant_report on public.report_exports(tenant_id, report_id);

-- -----------------------------------------------------------------------------
-- Private exports bucket
-- File path convention inside this bucket:
--   {tenant_id}/{report_id}/{export_id}.pdf
--   {tenant_id}/{report_id}/{export_id}.pptx
--   {tenant_id}/{report_id}/{export_id}.xlsx
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do update set public = false;

commit;
