-- 0010 — Allow single officer deploy
-- ---------------------------------------------------------------------------
-- Relaxes the activate_pool constraint to allow pools to be deployed with a
-- single officer.

create or replace function public.activate_pool(p_pool uuid, p_contract_id text, p_wasm_hash text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_pool public.pools%rowtype;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_contract_id is null or p_contract_id !~ '^C[A-Z2-7]{55}$' then
    raise exception 'invalid contract id';
  end if;

  select * into v_pool from public.pools where id = p_pool for update;
  if not found then raise exception 'pool not found'; end if;
  if v_pool.status <> 'draft' or v_pool.contract_id is not null then
    raise exception 'pool is not a deployable draft';
  end if;

  if not exists (
    select 1 from public.pool_members m
    where m.pool_id = p_pool and m.user_id = v_uid and m.role = 'officer'
  ) then raise exception 'not an officer'; end if;

  -- Relaxed to 1 officer
  if (select count(*) from public.pool_members m
      where m.pool_id = p_pool and m.role = 'officer') < 1 then
    raise exception 'need at least 1 officer';
  end if;

  if exists (
    select 1 from public.pool_members m
    where m.pool_id = p_pool and m.role = 'officer' and m.stellar_address is null
  ) then raise exception 'all officers must link a wallet first'; end if;

  update public.pools
  set contract_id = p_contract_id, wasm_hash = p_wasm_hash, status = 'active'
  where id = p_pool;
end;
$$;
revoke execute on function public.activate_pool(uuid, text, text) from public, anon;
grant execute on function public.activate_pool(uuid, text, text) to authenticated, service_role;
