
alter table public.notifications replica identity full;
alter publication supabase_realtime add table public.notifications;
