-- Atomic draft governance-policy replacement.
-- Money authority remains in Soroban: this only edits directory policy rows
-- before deployment and cannot alter any active contract.

create or replace function public.replace_pool_governance_policy(
  p_pool_id uuid,
  p_categories jsonb,
  p_tiers jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category jsonb;
  v_tier jsonb;
  v_order integer := 0;
begin
  if not public.is_pool_officer(p_pool_id) then
    raise exception 'officer access required';
  end if;
  if not exists (
    select 1 from public.pools
    where id = p_pool_id and status in ('draft', 'collecting_signers', 'ready')
  ) then
    raise exception 'governance policy is locked after deployment';
  end if;
  if jsonb_typeof(p_categories) <> 'array' or jsonb_array_length(p_categories) = 0 then
    raise exception 'at least one category is required';
  end if;
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then
    raise exception 'at least one approval tier is required';
  end if;

  delete from public.pool_categories where pool_id = p_pool_id;
  for v_category in select value from jsonb_array_elements(p_categories) loop
    if char_length(trim(coalesce(v_category ->> 'name', ''))) not between 1 and 60 then
      raise exception 'category names must be 1 to 60 characters';
    end if;
    insert into public.pool_categories (
      pool_id, name, description, per_transaction_cap,
      rolling_monthly_cap, attachment_required, sort_order
    ) values (
      p_pool_id,
      trim(v_category ->> 'name'),
      nullif(trim(coalesce(v_category ->> 'description', '')), ''),
      nullif(v_category ->> 'per_transaction_cap', '')::numeric,
      nullif(v_category ->> 'rolling_monthly_cap', '')::numeric,
      coalesce((v_category ->> 'attachment_required')::boolean, false),
      v_order
    );
    v_order := v_order + 1;
  end loop;

  delete from public.pool_approval_tiers where pool_id = p_pool_id;
  for v_tier in select value from jsonb_array_elements(p_tiers) loop
    if coalesce((v_tier ->> 'minimum_amount')::numeric, -1) < 0 then
      raise exception 'tier minimum must be zero or greater';
    end if;
    if coalesce((v_tier ->> 'required_approvals')::integer, 0) < 1 then
      raise exception 'tier approval count must be positive';
    end if;
    insert into public.pool_approval_tiers (pool_id, minimum_amount, required_approvals)
    values (
      p_pool_id,
      (v_tier ->> 'minimum_amount')::numeric,
      (v_tier ->> 'required_approvals')::integer
    );
  end loop;
end;
$$;

revoke all on function public.replace_pool_governance_policy(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_pool_governance_policy(uuid, jsonb, jsonb) to authenticated;
