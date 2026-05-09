-- Phase 1 / Priority 6: Usage billing controls.
-- Adds a tenant-scoped RPC used by Edge Functions before paid AI/API work.

begin;

create or replace function public.consume_usage_event(
  p_tenant_id uuid,
  p_event_type public.usage_event_type,
  p_quantity integer default 1,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plan;
  v_limits jsonb;
  v_limit integer;
  v_used integer;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if not public.current_user_has_tenant_role(
      p_tenant_id,
      array['owner','admin','member']::public.tenant_role[]
    ) then
      raise exception 'not allowed';
    end if;
  end if;

  select s.plan, s.limits
  into v_plan, v_limits
  from public.subscriptions s
  where s.tenant_id = p_tenant_id
    and s.status in ('trialing', 'active')
  order by s.created_at desc
  limit 1;

  if v_plan is null then
    v_plan := 'starter';
    v_limits := jsonb_build_object(
      'analysis_runs_monthly', 10,
      'field_completions_monthly', 50,
      'searches_monthly', 100,
      'ai_tokens_monthly', 250000,
      'exports_monthly', 20,
      'members', 3
    );
  end if;

  v_limit :=
    case p_event_type
      when 'analysis_run' then coalesce((v_limits->>'analysis_runs_monthly')::integer, 10)
      when 'autofill' then coalesce((v_limits->>'field_completions_monthly')::integer, 50)
      when 'field_completion' then coalesce((v_limits->>'field_completions_monthly')::integer, 50)
      when 'tavily_search' then coalesce((v_limits->>'searches_monthly')::integer, 100)
      when 'ai_tokens' then coalesce((v_limits->>'ai_tokens_monthly')::integer, 250000)
      when 'export_pdf' then coalesce((v_limits->>'exports_monthly')::integer, 20)
      when 'export_pptx' then coalesce((v_limits->>'exports_monthly')::integer, 20)
      when 'export_xlsx' then coalesce((v_limits->>'exports_monthly')::integer, 20)
      else 1000000
    end;

  if p_idempotency_key is not null then
    if exists (
      select 1
      from public.usage_events ue
      where ue.tenant_id = p_tenant_id
        and ue.event_type = p_event_type
        and ue.idempotency_key = p_idempotency_key
    ) then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'event_type', p_event_type,
        'limit', v_limit
      );
    end if;
  end if;

  select coalesce(sum(ue.quantity), 0)
  into v_used
  from public.usage_events ue
  where ue.tenant_id = p_tenant_id
    and ue.event_type = p_event_type
    and ue.created_at >= v_month_start;

  if v_used + p_quantity > v_limit then
    raise exception 'usage limit exceeded';
  end if;

  insert into public.usage_events (
    tenant_id,
    user_id,
    event_type,
    quantity,
    idempotency_key,
    metadata
  )
  values (
    p_tenant_id,
    v_user_id,
    p_event_type,
    p_quantity,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_type', p_event_type,
    'plan', v_plan,
    'used', v_used + p_quantity,
    'limit', v_limit,
    'remaining', greatest(v_limit - (v_used + p_quantity), 0)
  );
end;
$$;

revoke all on function public.consume_usage_event(
  uuid,
  public.usage_event_type,
  integer,
  text,
  jsonb
) from public;

grant execute on function public.consume_usage_event(
  uuid,
  public.usage_event_type,
  integer,
  text,
  jsonb
) to authenticated, service_role;

commit;
