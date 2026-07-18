create extension if not exists pgcrypto with schema extensions;

create or replace function public.generate_report_slug()
returns text language sql volatile security definer
set search_path = pg_catalog, extensions
as $$ select encode(extensions.gen_random_bytes(16), 'hex'); $$;
revoke execute on function public.generate_report_slug() from public, anon, authenticated;
grant execute on function public.generate_report_slug() to authenticated;

create sequence if not exists public.report_display_id_seq;
revoke all on sequence public.report_display_id_seq from public, anon, authenticated;

create or replace function public.generate_report_display_id()
returns text language sql volatile security definer
set search_path = pg_catalog, public
as $$ select 'CAI-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.report_display_id_seq')::text, 8, '0'); $$;
revoke execute on function public.generate_report_display_id() from public, anon, authenticated;
grant execute on function public.generate_report_display_id() to authenticated;

alter table public.reports
  add column if not exists display_id text;
update public.reports set display_id = public.generate_report_display_id() where display_id is null;
alter table public.reports
  alter column display_id set default public.generate_report_display_id(),
  alter column display_id set not null;
create unique index if not exists reports_display_id_unique_idx on public.reports(display_id);

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
  add column if not exists generation_seed bigint,
  add column if not exists canonical_validated boolean,
  add column if not exists legacy_report_id text,
  add column if not exists save_operation_key text;

update public.reports set canonical_validated = coalesce(canonical_validated, false) where canonical_validated is null;
alter table public.reports
  alter column canonical_validated set default true,
  alter column canonical_validated set not null;

update public.reports set root_report_id = coalesce(root_report_id, parent_report_id, id) where root_report_id is null;

create or replace function public.set_report_root_id()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.parent_report_id is null then
    new.root_report_id := new.id;
  else
    select coalesce(r.root_report_id, r.id) into new.root_report_id
    from public.reports r where r.id = new.parent_report_id;
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

alter table public.reports
  drop constraint if exists reports_save_operation_key_format_check;
alter table public.reports
  add constraint reports_save_operation_key_format_check
  check (
    save_operation_key is null
    or (octet_length(save_operation_key) between 16 and 128
        and save_operation_key ~ '^[A-Za-z0-9_-]+$')
  );
create unique index if not exists reports_user_save_operation_key_uidx
  on public.reports (user_id, save_operation_key)
  where save_operation_key is not null;
