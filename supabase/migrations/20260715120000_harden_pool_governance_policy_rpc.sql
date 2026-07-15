-- Reject malformed or excessive draft governance policies before replacing
-- normalized directory rows. This remains metadata-only; Soroban is the sole
-- authority over deployed spending and approvals.

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
  v_officer_count integer;
  v_per_transaction_cap numeric;
  v_rolling_monthly_cap numeric;
  v_minimum_amount numeric;
  v_required_approvals integer;
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
  if p_categories is null or jsonb_typeof(p_categories) <> 'array'
     or jsonb_array_length(p_categories) not between 1 and 50 then
    raise exception 'between 1 and 50 categories are required';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array'
     or jsonb_array_length(p_tiers) not between 1 and 20 then
    raise exception 'between 1 and 20 approval tiers are required';
  end if;

  select count(*) into v_officer_count
  from public.pool_members
  where pool_id = p_pool_id and role in ('owner', 'officer');

  delete from public.pool_categories where pool_id = p_pool_id;
  for v_category in select value from jsonb_array_elements(p_categories) loop
    if char_length(trim(coalesce(v_category ->> 'name', ''))) not between 1 and 60 then
      raise exception 'category names must be 1 to 60 characters';
    end if;
    v_per_transaction_cap := nullif(v_category ->> 'per_transaction_cap', '')::numeric;
    v_rolling_monthly_cap := nullif(v_category ->> 'rolling_monthly_cap', '')::numeric;
    if coalesce(v_per_transaction_cap, 1) <= 0 or coalesce(v_rolling_monthly_cap, 1) <= 0 then
      raise exception 'category caps must be positive';
    end if;
    insert into public.pool_categories (
      pool_id, name, description, per_transaction_cap,
      rolling_monthly_cap, attachment_required, sort_order
    ) values (
      p_pool_id,
      trim(v_category ->> 'name'),
      nullif(trim(coalesce(v_category ->> 'description', '')), ''),
      v_per_transaction_cap,
      v_rolling_monthly_cap,
      coalesce((v_category ->> 'attachment_required')::boolean, false),
      v_order
    );
    v_order := v_order + 1;
  end loop;

  delete from public.pool_approval_tiers where pool_id = p_pool_id;
  for v_tier in select value from jsonb_array_elements(p_tiers) loop
    v_minimum_amount := (v_tier ->> 'minimum_amount')::numeric;
    v_required_approvals := (v_tier ->> 'required_approvals')::integer;
    if v_minimum_amount is null or v_minimum_amount < 0 then
      raise exception 'tier minimum must be zero or greater';
    end if;
    if v_required_approvals is null or v_required_approvals < 1
       or v_required_approvals > v_officer_count then
      raise exception 'tier approvals must fit the officer count';
    end if;
    insert into public.pool_approval_tiers (pool_id, minimum_amount, required_approvals)
    values (p_pool_id, v_minimum_amount, v_required_approvals);
  end loop;
end;
$$;

revoke all on function public.replace_pool_governance_policy(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_pool_governance_policy(uuid, jsonb, jsonb) to authenticated;
