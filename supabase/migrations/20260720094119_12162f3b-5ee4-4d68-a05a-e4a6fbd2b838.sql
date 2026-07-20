
drop policy if exists "Profiles viewable by everyone" on public.profiles;
create policy "Users view own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

alter table public.reports alter column is_public set default false;

revoke execute on function public.generate_report_slug() from anon, public;
revoke execute on function public.generate_report_display_id() from anon, public;
revoke execute on function public.has_role(uuid, public.app_role) from anon, public;
revoke execute on function public.begin_analysis_request(text, text, text, text) from anon, public;
revoke execute on function public.complete_analysis_request(uuid, text, text, text, jsonb, text, text) from anon, public;
