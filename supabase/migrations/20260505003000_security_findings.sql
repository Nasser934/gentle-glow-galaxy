-- Security scanner remediation.

-- 1) Remove permissive report_status_history INSERT policy risk.
-- Drop all INSERT policies on report_status_history, then recreate a single admin-only policy.
do $$
declare
  policy_name text;
begin
  for policy_name in
    select pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'report_status_history'
      and pol.polcmd = 'a'
  loop
    execute format('drop policy if exists %I on public.report_status_history', policy_name);
  end loop;
end $$;

drop policy if exists "report_status_history_insert_owner" on public.report_status_history;
drop policy if exists "report_status_history_insert_admin" on public.report_status_history;

create policy "report_status_history_insert_admin"
on public.report_status_history
for insert
with check (public.has_role(auth.uid(), 'admin'::text));

-- 2) Restrict has_role to self-lookup to prevent role enumeration.
-- This supports the common Lovable app_role enum.
do $$
begin
  if to_regtype('public.app_role') is not null then
    execute $fn$
      create or replace function public.has_role(_user_id uuid, _role public.app_role)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select _user_id = auth.uid()
          and exists (
            select 1
            from public.user_roles
            where user_id = _user_id
              and role = _role
          );
      $body$;
    $fn$;
  end if;
end $$;

-- Text overload for projects where role is stored as text.
create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _user_id = auth.uid()
    and exists (
      select 1
      from public.user_roles
      where user_id = _user_id
        and role::text = _role
    );
$$;

-- 3) Add database-level comment body limit.
alter table public.report_comments
  drop constraint if exists report_comments_body_length_chk;

alter table public.report_comments
  add constraint report_comments_body_length_chk
  check (char_length(body) <= 2000);
