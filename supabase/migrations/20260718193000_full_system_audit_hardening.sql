-- Full-system audit hardening for The Joy Creator / Concept AI.
-- Forward-only and safe for legacy reports: historical non-canonical rows remain
-- readable/manageable, while every new report must pass the stronger validator.

revoke create on schema public from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Canonical report integrity and database-derived audit metadata
-- ---------------------------------------------------------------------------

create or replace function public.is_canonical_report_output(p_output jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select
    jsonb_typeof(p_output) = 'object'
    and jsonb_typeof(p_output -> 'scores') = 'object'
    and jsonb_typeof(p_output #> '{scores,overall}') = 'number'
    and (p_output #>> '{scores,overall}')::numeric between 0 and 10
    and jsonb_typeof(p_output -> 'scoringAudit') = 'object'
    and jsonb_typeof(p_output -> 'qualityMetadata') = 'object'
    and jsonb_typeof(p_output -> 'sources') = 'array'
    and jsonb_typeof(p_output -> 'claims') = 'array'
    and jsonb_typeof(p_output -> 'validationWarnings') = 'array'
    and jsonb_typeof(p_output -> 'normalizedFigures') = 'object'
    and jsonb_typeof(p_output -> 'decision') = 'object'
    and jsonb_typeof(p_output -> 'reportSchemaVersion') = 'string'
    and coalesce(p_output ->> 'reportSchemaVersion', '') ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    and p_output #>> '{qualityMetadata,reportSchemaVersion}' = p_output ->> 'reportSchemaVersion'
    and coalesce(p_output #>> '{qualityMetadata,inputHash}', '') ~ '^sha256:[0-9a-f]{64}$'
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,modelId}', '')), '') is not null
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,promptVersion}', '')), '') is not null
    and nullif(btrim(coalesce(p_output #>> '{qualityMetadata,scoringEngineVersion}', '')), '') is not null;
$$;

revoke execute on function public.is_canonical_report_output(jsonb) from public, anon, authenticated;

drop trigger if exists trg_enforce_report_canonical_validation on public.reports;

update public.reports
set canonical_validated = public.is_canonical_report_output(output)
where canonical_validated is distinct from public.is_canonical_report_output(output);

create or replace function public.enforce_report_canonical_validation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' or new.output is distinct from old.output then
    if not public.is_canonical_report_output(new.output) then
      raise exception using
        errcode = '23514',
        message = 'Report output does not satisfy the canonical report schema';
    end if;
    new.canonical_validated := true;
  else
    new.canonical_validated := old.canonical_validated;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_report_canonical_validation
before insert or update of output, canonical_validated on public.reports
for each row execute function public.enforce_report_canonical_validation();

revoke execute on function public.enforce_report_canonical_validation() from public, anon, authenticated;

alter table public.reports
  drop constraint if exists reports_canonical_output_check;
alter table public.reports
  add constraint reports_canonical_output_check
  check (not canonical_validated or public.is_canonical_report_output(output)) not valid;

create or replace function public.sync_report_audit_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.model_id := nullif(btrim(new.output #>> '{qualityMetadata,modelId}'), '');
  new.prompt_version := nullif(btrim(new.output #>> '{qualityMetadata,promptVersion}'), '');
  new.scoring_engine_version := nullif(btrim(new.output #>> '{qualityMetadata,scoringEngineVersion}'), '');
  new.research_timestamp := case
    when coalesce(new.output #>> '{qualityMetadata,researchTimestamp}', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (new.output #>> '{qualityMetadata,researchTimestamp}')::timestamptz
    else null
  end;
  new.input_hash := nullif(btrim(new.output #>> '{qualityMetadata,inputHash}'), '');
  new.report_schema_version := nullif(btrim(new.output ->> 'reportSchemaVersion'), '');
  new.generation_timestamp := case
    when coalesce(new.output #>> '{qualityMetadata,generationTimestamp}', '') ~ '^\d{4}-\d{2}-\d{2}T'
      then (new.output #>> '{qualityMetadata,generationTimestamp}')::timestamptz
    else null
  end;
  new.source_snapshot_metadata := jsonb_build_object(
    'sourceCount', jsonb_array_length(coalesce(new.output -> 'sources', '[]'::jsonb)),
    'sources', coalesce(new.output -> 'sources', '[]'::jsonb)
  );
  return new;
end;
$$;

drop trigger if exists trg_reports_audit_metadata on public.reports;
create trigger trg_reports_audit_metadata
before insert or update of output on public.reports
for each row execute function public.sync_report_audit_metadata();

revoke execute on function public.sync_report_audit_metadata() from public, anon, authenticated;

update public.reports
set output = output
where canonical_validated = true
  and (
    model_id is distinct from output #>> '{qualityMetadata,modelId}'
    or prompt_version is distinct from output #>> '{qualityMetadata,promptVersion}'
    or scoring_engine_version is distinct from output #>> '{qualityMetadata,scoringEngineVersion}'
    or input_hash is distinct from output #>> '{qualityMetadata,inputHash}'
    or report_schema_version is distinct from output ->> 'reportSchemaVersion'
  );

-- Only user-controlled report fields are writable from the browser. Database
-- identifiers, audit fields and generated output metadata are trigger-owned.
revoke all on table public.reports from anon, authenticated;
grant select on table public.reports to authenticated;
grant insert (user_id, title, industry, inputs, output, parent_report_id, save_operation_key)
  on table public.reports to authenticated;
grant update (status, is_public) on table public.reports to authenticated;
grant delete on table public.reports to authenticated;

alter table public.reports
  drop constraint if exists reports_title_length_check;
alter table public.reports
  add constraint reports_title_length_check
  check (char_length(btrim(title)) between 1 and 200) not valid;

alter table public.reports
  drop constraint if exists reports_industry_length_check;
alter table public.reports
  add constraint reports_industry_length_check
  check (industry is null or char_length(industry) <= 120) not valid;

alter table public.reports
  drop constraint if exists reports_json_shape_check;
alter table public.reports
  add constraint reports_json_shape_check
  check (
    jsonb_typeof(inputs) = 'object'
    and jsonb_typeof(output) = 'object'
    and jsonb_typeof(source_snapshot_metadata) = 'object'
  ) not valid;

alter table public.reports
  drop constraint if exists reports_payload_size_check;
alter table public.reports
  add constraint reports_payload_size_check
  check (
    octet_length(inputs::text) <= 131072
    and octet_length(output::text) <= 4194304
    and octet_length(source_snapshot_metadata::text) <= 2097152
  ) not valid;

alter table public.reports
  drop constraint if exists reports_display_id_format_check;
alter table public.reports
  add constraint reports_display_id_format_check
  check (display_id ~ '^CAI-[0-9]{4}-[0-9]{8,}$') not valid;

-- ---------------------------------------------------------------------------
-- Exact-report read APIs; block enumeration of public discussions/profiles
-- ---------------------------------------------------------------------------

create or replace function public.get_report_by_slug(p_slug text)
returns setof public.reports
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select r.*
  from public.reports r
  left join public.report_slug_aliases a on a.report_id = r.id
  where (r.slug = p_slug or a.old_slug = p_slug)
    and r.archived_at is null
    and (r.is_public = true or r.user_id = auth.uid())
  order by (r.slug = p_slug) desc
  limit 1;
$$;

revoke execute on function public.get_report_by_slug(text) from public;
grant execute on function public.get_report_by_slug(text) to anon, authenticated;

create or replace function public.can_view_report(_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.reports r
    where r.id = _report_id
      and r.archived_at is null
      and (r.is_public = true or r.user_id = auth.uid())
  );
$$;

revoke execute on function public.can_view_report(uuid) from public;
grant execute on function public.can_view_report(uuid) to anon, authenticated;

create or replace function public.get_report_comments(
  p_report_id uuid,
  p_section text default null
)
returns table(
  id uuid,
  report_id uuid,
  user_id uuid,
  section text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select c.id, c.report_id, c.user_id, c.section, c.body, c.created_at
  from public.report_comments c
  where c.report_id = p_report_id
    and (p_section is null or c.section = p_section)
    and public.can_view_report(p_report_id)
  order by c.created_at asc
  limit 500;
$$;

create or replace function public.get_report_comment_profiles(p_report_id uuid)
returns table(user_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select distinct p.user_id, p.display_name, p.avatar_url
  from public.profiles p
  join public.report_comments c on c.user_id = p.user_id
  where c.report_id = p_report_id
    and public.can_view_report(p_report_id)
  order by p.user_id;
$$;

create or replace function public.get_report_status_history(p_report_id uuid)
returns table(
  id uuid,
  report_id uuid,
  changed_by uuid,
  from_status public.report_status,
  to_status public.report_status,
  note text,
  change_source text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select h.id, h.report_id, h.changed_by, h.from_status, h.to_status,
         h.note, h.change_source, h.created_at
  from public.report_status_history h
  where h.report_id = p_report_id
    and public.can_view_report(p_report_id)
  order by h.created_at desc
  limit 500;
$$;

revoke execute on function public.get_report_comments(uuid, text) from public;
revoke execute on function public.get_report_comment_profiles(uuid) from public;
revoke execute on function public.get_report_status_history(uuid) from public;
grant execute on function public.get_report_comments(uuid, text) to anon, authenticated;
grant execute on function public.get_report_comment_profiles(uuid) to anon, authenticated;
grant execute on function public.get_report_status_history(uuid) to anon, authenticated;

drop policy if exists "Comments viewable when report viewable" on public.report_comments;
drop policy if exists "Status history viewable when report viewable" on public.report_status_history;
drop policy if exists "Profiles visible in accessible discussions" on public.profiles;
drop policy if exists "Profiles viewable by everyone" on public.profiles;
drop policy if exists "Users view own profile" on public.profiles;
create policy "Users view own profile"
on public.profiles for select to authenticated
using (auth.uid() = user_id);

revoke all on table public.report_comments from anon, authenticated;
grant insert (report_id, user_id, section, body), delete
  on table public.report_comments to authenticated;

revoke all on table public.report_status_history from anon, authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select (user_id, display_name, avatar_url) on table public.profiles to authenticated;
grant insert (user_id, display_name, avatar_url) on table public.profiles to authenticated;
grant update (display_name, avatar_url, updated_at) on table public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic archive/restore and sharing safety
-- ---------------------------------------------------------------------------

update public.reports
set is_public = false
where archived_at is not null and is_public = true;

alter table public.reports
  drop constraint if exists reports_archived_private_check;
alter table public.reports
  add constraint reports_archived_private_check
  check (archived_at is null or is_public = false) not valid;

create or replace function public.set_report_group_archived(
  p_report_id uuid,
  p_archived boolean
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_root_id uuid;
  v_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select coalesce(r.root_report_id, r.id)
    into v_root_id
  from public.reports r
  where r.id = p_report_id and r.user_id = v_user_id;

  if v_root_id is null then
    raise exception using errcode = '42501', message = 'Report not found or not owned by caller';
  end if;

  with recursive descendants(id) as (
    select r.id
    from public.reports r
    where r.id = v_root_id and r.user_id = v_user_id
    union
    select child.id
    from public.reports child
    join descendants parent on child.parent_report_id = parent.id
    where child.user_id = v_user_id
  )
  update public.reports r
  set archived_at = case when p_archived then now() else null end,
      is_public = case when p_archived then false else r.is_public end
  where r.id in (select id from descendants);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_report_group_archived(uuid, boolean) from public, anon;
grant execute on function public.set_report_group_archived(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Version-lineage integrity and missing FK-supporting indexes
-- ---------------------------------------------------------------------------

create or replace function public.set_report_root_id()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_parent_id uuid;
  v_parent_user_id uuid;
  v_parent_root_id uuid;
  v_cursor uuid;
  v_depth integer := 0;
begin
  if new.parent_report_id is null then
    new.root_report_id := new.id;
    return new;
  end if;

  if new.parent_report_id = new.id then
    raise exception using errcode = '23514', message = 'A report cannot be its own parent';
  end if;

  select r.id, r.user_id, coalesce(r.root_report_id, r.id)
    into v_parent_id, v_parent_user_id, v_parent_root_id
  from public.reports r
  where r.id = new.parent_report_id;

  if v_parent_id is null then
    raise exception using errcode = '23503', message = 'Parent report does not exist';
  end if;
  if v_parent_user_id is distinct from new.user_id then
    raise exception using errcode = '42501', message = 'Parent report must have the same owner';
  end if;

  v_cursor := v_parent_id;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception using errcode = '23514', message = 'Report lineage cycle detected';
    end if;
    select r.parent_report_id into v_cursor
    from public.reports r
    where r.id = v_cursor;
    v_depth := v_depth + 1;
    if v_depth > 50 then
      raise exception using errcode = '23514', message = 'Report lineage depth exceeds limit';
    end if;
  end loop;

  new.parent_report_id := v_parent_root_id;
  new.root_report_id := v_parent_root_id;
  return new;
end;
$$;

revoke execute on function public.set_report_root_id() from public, anon, authenticated;

create index if not exists report_slug_aliases_report_id_idx
  on public.report_slug_aliases(report_id);
create index if not exists report_comments_user_id_idx
  on public.report_comments(user_id);
create index if not exists report_status_history_changed_by_idx
  on public.report_status_history(changed_by);
create index if not exists notifications_report_id_idx
  on public.notifications(report_id);
create index if not exists notifications_actor_id_idx
  on public.notifications(actor_id);

alter table public.report_status_history
  drop constraint if exists report_status_history_note_length_check;
alter table public.report_status_history
  add constraint report_status_history_note_length_check
  check (note is null or char_length(note) <= 2000) not valid;

alter table public.analysis_requests
  drop constraint if exists analysis_requests_hash_format_check;
alter table public.analysis_requests
  add constraint analysis_requests_hash_format_check
  check (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
    and (ip_hash is null or ip_hash ~ '^sha256:[0-9a-f]{64}$')
  ) not valid;

alter table public.analysis_requests
  drop constraint if exists analysis_requests_completion_time_check;
alter table public.analysis_requests
  add constraint analysis_requests_completion_time_check
  check (
    (completion_status = 'running' and completed_at is null)
    or (completion_status <> 'running' and completed_at is not null)
  ) not valid;

comment on function public.get_report_comments(uuid, text) is
  'Returns comments only for one report the caller may view; prevents table-wide public enumeration.';
comment on function public.get_report_comment_profiles(uuid) is
  'Returns limited commenter profile fields only for one viewable report.';
comment on function public.set_report_group_archived(uuid, boolean) is
  'Atomically archives/restores an owned report lineage and revokes sharing when archived.';