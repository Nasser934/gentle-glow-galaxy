-- Concept AI hackathon-readiness hardening.
-- Additive/reversible migration: historical reports remain in place and old
-- unsafe slugs are retained as aliases while current slugs become URL-safe.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- URL-safe, high-entropy report slugs and collision-free display identifiers
-- ---------------------------------------------------------------------------

create or replace function public.generate_report_slug()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, extensions
as $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;

revoke execute on function public.generate_report_slug() from public, anon, authenticated;
grant execute on function public.generate_report_slug() to authenticated;

create table if not exists public.report_slug_aliases (
  old_slug text primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  migrated_at timestamptz not null default now()
);

alter table public.report_slug_aliases enable row level security;
revoke all on table public.report_slug_aliases from anon, authenticated;

insert into public.report_slug_aliases (old_slug, report_id)
select slug, id
from public.reports
where slug !~ '^[A-Za-z0-9_-]{20,64}$'
on conflict (old_slug) do nothing;

update public.reports
set slug = public.generate_report_slug()
where slug !~ '^[A-Za-z0-9_-]{20,64}$';

alter table public.reports
  alter column slug set default public.generate_report_slug();

alter table public.reports
  drop constraint if exists reports_slug_url_safe;
alter table public.reports
  add constraint reports_slug_url_safe
  check (slug ~ '^[A-Za-z0-9_-]{20,64}$');

create sequence if not exists public.report_display_id_seq;
revoke all on sequence public.report_display_id_seq from public, anon, authenticated;

create or replace function public.generate_report_display_id()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $$
  select 'CAI-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.report_display_id_seq')::text, 8, '0');
$$;

revoke execute on function public.generate_report_display_id() from public, anon, authenticated;
grant execute on function public.generate_report_display_id() to authenticated;

alter table public.reports
  add column if not exists display_id text;
update public.reports
set display_id = public.generate_report_display_id()
where display_id is null;
alter table public.reports
  alter column display_id set default public.generate_report_display_id(),
  alter column display_id set not null;
create unique index if not exists reports_display_id_unique_idx on public.reports(display_id);

-- ---------------------------------------------------------------------------
-- Report audit/version metadata
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists root_report_id uuid references public.reports(id) on delete set null,
  add column if not exists model_id text,
  add column if not exists prompt_version text,
  add column if not exists scoring_engine_version text,
  add column if not exists research_timestamp timestamptz,
  add column if not exists source_snapshot_metadata jsonb not null default '{}'::jsonb,
  add column if not exists input_hash text,
  add column if not exists report_schema_version text,
  add column if not exists generation_timestamp timestamptz,
  add column if not exists generation_seed bigint;

-- Existing reports predate the canonical schema and must remain shareable,
-- archivable, and readable. New reports (and any report whose output is
-- replaced) are always marked for canonical validation by the trigger below.
alter table public.reports
  add column if not exists canonical_validated boolean;

update public.reports
set canonical_validated = coalesce(
  jsonb_typeof(output -> 'scores' -> 'overall') = 'number'
  and output ? 'scoringAudit'
  and output ? 'reportSchemaVersion',
  false
)
where canonical_validated is null;

alter table public.reports
  alter column canonical_validated set default true,
  alter column canonical_validated set not null;

create or replace function public.enforce_report_canonical_validation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.canonical_validated := true;
  elsif new.output is distinct from old.output then
    new.canonical_validated := true;
  else
    new.canonical_validated := old.canonical_validated;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_report_canonical_validation on public.reports;
create trigger trg_enforce_report_canonical_validation
before insert or update of output, canonical_validated on public.reports
for each row execute function public.enforce_report_canonical_validation();

revoke execute on function public.enforce_report_canonical_validation() from public, anon, authenticated;

update public.reports
set root_report_id = coalesce(parent_report_id, id)
where root_report_id is null;

update public.reports
set
  model_id = coalesce(model_id, output #>> '{qualityMetadata,modelId}'),
  prompt_version = coalesce(prompt_version, output #>> '{qualityMetadata,promptVersion}'),
  scoring_engine_version = coalesce(scoring_engine_version, output #>> '{qualityMetadata,scoringEngineVersion}'),
  input_hash = coalesce(input_hash, output #>> '{qualityMetadata,inputHash}'),
  report_schema_version = coalesce(report_schema_version, output #>> '{qualityMetadata,reportSchemaVersion}', output ->> 'reportSchemaVersion')
where model_id is null
   or prompt_version is null
   or scoring_engine_version is null
   or input_hash is null
   or report_schema_version is null;

create or replace function public.set_report_root_id()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.parent_report_id is null then
    new.root_report_id := new.id;
  else
    select coalesce(r.root_report_id, r.id)
      into new.root_report_id
    from public.reports r
    where r.id = new.parent_report_id;
    if new.root_report_id is null then
      raise exception 'Parent report does not exist';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reports_root_id on public.reports;
create trigger trg_reports_root_id
before insert or update of parent_report_id on public.reports
for each row execute function public.set_report_root_id();
revoke execute on function public.set_report_root_id() from public, anon, authenticated;

create index if not exists reports_root_created_idx on public.reports(root_report_id, created_at);
create index if not exists reports_user_created_idx on public.reports(user_id, created_at desc);
create index if not exists reports_public_slug_idx on public.reports(slug) where is_public = true;

alter table public.reports alter column is_public set default false;

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

-- ---------------------------------------------------------------------------
-- Exact-slug public reads; public rows cannot be enumerated from the table API
-- ---------------------------------------------------------------------------

create or replace function public.can_view_report(_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.reports r
    where r.id = _report_id
      and (r.is_public = true or r.user_id = auth.uid())
  );
$$;

revoke execute on function public.can_view_report(uuid) from public;
grant execute on function public.can_view_report(uuid) to anon, authenticated;

create or replace function public.get_report_by_slug(p_slug text)
returns setof public.reports
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.*
  from public.reports r
  left join public.report_slug_aliases a on a.report_id = r.id
  where (r.slug = p_slug or a.old_slug = p_slug)
    and (r.is_public = true or r.user_id = auth.uid())
  order by (r.slug = p_slug) desc
  limit 1;
$$;

revoke execute on function public.get_report_by_slug(text) from public;
grant execute on function public.get_report_by_slug(text) to anon, authenticated;

drop policy if exists "Public reports viewable by slug" on public.reports;
drop policy if exists "Owners view own reports" on public.reports;
create policy "Owners view own reports"
on public.reports for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Owners update own reports" on public.reports;
create policy "Owners update own reports"
on public.reports for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Keep signed-in review comments on shared reports, while revoked/private
-- reports immediately stop being readable or commentable by other users.
drop policy if exists "Comments viewable when report viewable" on public.report_comments;
create policy "Comments viewable when report viewable"
on public.report_comments for select
using (public.can_view_report(report_id));

drop policy if exists "Signed-in users add comments to viewable reports" on public.report_comments;
create policy "Signed-in users add comments to viewable reports"
on public.report_comments for insert to authenticated
with check (auth.uid() = user_id and public.can_view_report(report_id));

drop policy if exists "Status history viewable when report viewable" on public.report_status_history;
create policy "Status history viewable when report viewable"
on public.report_status_history for select
using (public.can_view_report(report_id));

alter table public.report_comments
  drop constraint if exists report_comments_nonempty_body;
alter table public.report_comments
  add constraint report_comments_nonempty_body
  check (char_length(btrim(body)) between 1 and 2000) not valid;

alter table public.report_comments
  drop constraint if exists report_comments_section_length;
alter table public.report_comments
  add constraint report_comments_section_length
  check (section is null or char_length(section) <= 120) not valid;

-- Profiles are no longer globally enumerable. A viewer may see their own
-- profile or the limited profile of a commenter on a report they can view.
drop policy if exists "Profiles viewable by everyone" on public.profiles;
drop policy if exists "Profiles visible in accessible discussions" on public.profiles;
create policy "Profiles visible in accessible discussions"
on public.profiles for select
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.report_comments c
    where c.user_id = profiles.user_id
      and public.can_view_report(c.report_id)
  )
);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users mark own notifications" on public.notifications;
create policy "Users mark own notifications"
on public.notifications for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.notifications
  drop constraint if exists notifications_implemented_kind;
alter table public.notifications
  add constraint notifications_implemented_kind
  check (kind in ('comment', 'status')) not valid;

-- ---------------------------------------------------------------------------
-- Persistent usage control, idempotency, and privacy-safe generation logging
-- ---------------------------------------------------------------------------

create table if not exists public.analysis_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  idempotency_key text not null,
  request_hash text not null,
  ip_hash text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  model_id text,
  prompt_version text,
  usage_metadata jsonb not null default '{}'::jsonb,
  research_status text not null default 'pending',
  completion_status text not null default 'running',
  failure_category text,
  unique (user_id, function_name, idempotency_key),
  check (char_length(idempotency_key) between 16 and 128),
  check (completion_status in ('running', 'completed', 'failed', 'rate_limited')),
  check (research_status in ('pending', 'complete', 'partial', 'failed', 'not_requested'))
);

create table if not exists public.analysis_rate_limits (
  subject_key text not null,
  function_name text not null,
  window_kind text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_key, function_name, window_kind, window_start),
  check (window_kind in ('hour', 'day'))
);

create index if not exists analysis_requests_user_started_idx
  on public.analysis_requests(user_id, started_at desc);
create index if not exists analysis_requests_status_idx
  on public.analysis_requests(completion_status, started_at);
create index if not exists analysis_rate_limits_cleanup_idx
  on public.analysis_rate_limits(window_start);

alter table public.analysis_requests enable row level security;
alter table public.analysis_rate_limits enable row level security;
revoke all on table public.analysis_requests from anon, authenticated;
revoke all on table public.analysis_rate_limits from anon, authenticated;
grant select (id, function_name, started_at, completed_at, model_id, research_status, completion_status, failure_category)
  on public.analysis_requests to authenticated;

create policy "Users view own safe analysis request metadata"
on public.analysis_requests for select to authenticated
using (auth.uid() = user_id);

create or replace function public.begin_analysis_request(
  p_function_name text,
  p_idempotency_key text,
  p_request_hash text,
  p_ip_hash text default null
)
returns table(request_id uuid, allowed boolean, reason text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id uuid;
  v_hour timestamptz := date_trunc('hour', now());
  v_day timestamptz := date_trunc('day', now());
  v_user_hour integer;
  v_user_day integer;
  v_ip_hour integer := 0;
  v_user_hour_limit integer;
  v_user_day_limit integer;
  v_ip_hour_limit integer;
begin
  if v_user_id is null then
    return query select null::uuid, false, 'unauthenticated'::text, 0;
    return;
  end if;
  if coalesce(p_function_name, '') not in ('analyze-concept', 'autofill-brief', 'complete-field')
     or coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{16,128}$'
     or coalesce(p_request_hash, '') !~ '^sha256:[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^sha256:[0-9a-f]{64}$') then
    return query select null::uuid, false, 'invalid_request_metadata'::text, 0;
    return;
  end if;

  select
    case p_function_name when 'analyze-concept' then 5 when 'autofill-brief' then 10 when 'complete-field' then 30 else 5 end,
    case p_function_name when 'analyze-concept' then 20 when 'autofill-brief' then 30 when 'complete-field' then 100 else 20 end,
    case p_function_name when 'analyze-concept' then 20 when 'autofill-brief' then 30 when 'complete-field' then 120 else 20 end
  into v_user_hour_limit, v_user_day_limit, v_ip_hour_limit;

  insert into public.analysis_requests (
    user_id, function_name, idempotency_key, request_hash, ip_hash
  ) values (
    v_user_id, p_function_name, p_idempotency_key, p_request_hash, nullif(p_ip_hash, '')
  )
  on conflict (user_id, function_name, idempotency_key) do nothing
  returning id into v_request_id;

  if v_request_id is null then
    select ar.id into v_request_id
    from public.analysis_requests ar
    where ar.user_id = v_user_id
      and ar.function_name = p_function_name
      and ar.idempotency_key = p_idempotency_key;
    return query select v_request_id, false, 'duplicate_request'::text, 0;
    return;
  end if;

  insert into public.analysis_rate_limits(subject_key, function_name, window_kind, window_start)
  values ('user:' || v_user_id::text, p_function_name, 'hour', v_hour)
  on conflict (subject_key, function_name, window_kind, window_start)
  do update set request_count = public.analysis_rate_limits.request_count + 1, updated_at = now()
  returning request_count into v_user_hour;

  insert into public.analysis_rate_limits(subject_key, function_name, window_kind, window_start)
  values ('user:' || v_user_id::text, p_function_name, 'day', v_day)
  on conflict (subject_key, function_name, window_kind, window_start)
  do update set request_count = public.analysis_rate_limits.request_count + 1, updated_at = now()
  returning request_count into v_user_day;

  if nullif(p_ip_hash, '') is not null then
    insert into public.analysis_rate_limits(subject_key, function_name, window_kind, window_start)
    values ('ip:' || p_ip_hash, p_function_name, 'hour', v_hour)
    on conflict (subject_key, function_name, window_kind, window_start)
    do update set request_count = public.analysis_rate_limits.request_count + 1, updated_at = now()
    returning request_count into v_ip_hour;
  end if;

  if v_user_hour > v_user_hour_limit or v_user_day > v_user_day_limit or v_ip_hour > v_ip_hour_limit then
    update public.analysis_requests
    set completion_status = 'rate_limited', completed_at = now(), failure_category = 'usage_limit'
    where id = v_request_id;
    return query select v_request_id, false, 'usage_limit'::text,
      greatest(1, 3600 - extract(epoch from (now() - v_hour))::integer);
    return;
  end if;

  return query select v_request_id, true, 'allowed'::text, 0;
end;
$$;

create or replace function public.complete_analysis_request(
  p_request_id uuid,
  p_completion_status text,
  p_model_id text default null,
  p_prompt_version text default null,
  p_usage_metadata jsonb default '{}'::jsonb,
  p_research_status text default 'not_requested',
  p_failure_category text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated integer;
begin
  if p_completion_status not in ('completed', 'failed')
     or p_research_status not in ('complete', 'partial', 'failed', 'not_requested') then
    return false;
  end if;

  update public.analysis_requests
  set completed_at = now(),
      completion_status = p_completion_status,
      model_id = left(p_model_id, 120),
      prompt_version = left(p_prompt_version, 120),
      usage_metadata = jsonb_strip_nulls(jsonb_build_object(
        'prompt_tokens', case
          when coalesce(p_usage_metadata ->> 'prompt_tokens', '') ~ '^[0-9]{1,12}$'
          then to_jsonb((p_usage_metadata ->> 'prompt_tokens')::bigint)
          else null
        end,
        'completion_tokens', case
          when coalesce(p_usage_metadata ->> 'completion_tokens', '') ~ '^[0-9]{1,12}$'
          then to_jsonb((p_usage_metadata ->> 'completion_tokens')::bigint)
          else null
        end,
        'total_tokens', case
          when coalesce(p_usage_metadata ->> 'total_tokens', '') ~ '^[0-9]{1,12}$'
          then to_jsonb((p_usage_metadata ->> 'total_tokens')::bigint)
          else null
        end
      )),
      research_status = p_research_status,
      failure_category = left(p_failure_category, 80)
  where id = p_request_id
    and user_id = auth.uid()
    and completion_status = 'running';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.begin_analysis_request(text, text, text, text) from public, anon;
grant execute on function public.begin_analysis_request(text, text, text, text) to authenticated;
revoke execute on function public.complete_analysis_request(uuid, text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.complete_analysis_request(uuid, text, text, text, jsonb, text, text) to authenticated;

comment on table public.analysis_requests is
  'Privacy-safe analysis lifecycle metadata. Full concept briefs and reports must never be logged here.';
