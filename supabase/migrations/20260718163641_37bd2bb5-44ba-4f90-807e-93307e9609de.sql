create or replace function public.can_view_report(_report_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.reports r
    where r.id = _report_id and (r.is_public = true or r.user_id = auth.uid())
  );
$$;
revoke execute on function public.can_view_report(uuid) from public;
grant execute on function public.can_view_report(uuid) to anon, authenticated;

create or replace function public.get_report_by_slug(p_slug text)
returns setof public.reports language sql stable security definer
set search_path = pg_catalog, public
as $$
  select r.* from public.reports r
  where r.slug = p_slug
    and (r.is_public = true or r.user_id = auth.uid())
  limit 1;
$$;
revoke execute on function public.get_report_by_slug(text) from public;
grant execute on function public.get_report_by_slug(text) to anon, authenticated;
