-- Persistent rate limiting for authenticated Edge Functions.

create table if not exists public.edge_rate_limits (
  user_id uuid not null,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, action, window_start)
);

create index if not exists edge_rate_limits_updated_idx
on public.edge_rate_limits (updated_at desc);

alter table public.edge_rate_limits enable row level security;

-- No client-side access. Edge Functions should use SUPABASE_SERVICE_ROLE_KEY for this table.
drop policy if exists "edge_rate_limits_no_client_access" on public.edge_rate_limits;
create policy "edge_rate_limits_no_client_access"
on public.edge_rate_limits
for all
using (false)
with check (false);
