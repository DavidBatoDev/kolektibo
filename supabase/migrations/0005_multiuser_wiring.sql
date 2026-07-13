-- 0005 — Multi-user wiring: draft pools, wallet-link challenges, membership RPCs
-- ---------------------------------------------------------------------------
-- Enables the auth ↔ wallet ↔ pools bridge:
--   • pools can exist as DB `draft`s before a contract is deployed (the treasury
--     contract has NO manage_officer — the officer set is frozen at initialize,
--     so every officer address must be collected and verified BEFORE deploy);
--   • `wallet_link_challenges` stores backend-issued nonces for wallet
--     proof-of-ownership (service-role only, like indexer_cursor);
--   • `user_wallets.verified_at` is column-grant-locked (0004 pattern) so only
--     the backend can mark a wallet verified;
--   • SECURITY DEFINER RPCs solve the RLS chicken-and-egg on pool creation
--     (creator can't SELECT the pool back or insert their own membership) and
--     let members set their own signing address;
--   • `preview_pool`/`redeem_invite` accept `draft` pools so officer invites
--     work pre-deploy; redeem now bumps used_count exactly once per user and
--     notifies existing officers.
-- Money authority is untouched: these rows are directory/read-model only.
-- ---------------------------------------------------------------------------

-- 1) Draft pools: contract_id arrives only at deploy.
alter table public.pools alter column contract_id drop not null;

alter table public.pools drop constraint pools_status_check;
alter table public.pools add constraint pools_status_check
  check (status in ('draft','deploying','active','migrated','archived'));

-- 2) Wallet-link nonce challenges (service-role only: RLS on, no policies).
create table public.wallet_link_challenges (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  stellar_address text not null,
  nonce           text not null,
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index wallet_link_challenges_user_idx
  on public.wallet_link_challenges (user_id, stellar_address);
alter table public.wallet_link_challenges enable row level security;
revoke all on table public.wallet_link_challenges from anon, authenticated;

-- 3) Column-lock user_wallets.verified_at (only the backend flips it). Clients
--    keep insert of unverified rows + label/primary edits via the "own wallets"
--    RLS policy; select/delete grants are untouched.
revoke insert, update on table public.user_wallets from anon, authenticated;
grant insert (user_id, stellar_address, kind, label, is_primary)
  on table public.user_wallets to authenticated;
grant update (label, is_primary)
  on table public.user_wallets to authenticated;

-- 4) Create a draft pool + creator as first officer (SECURITY DEFINER — the
--    "creator inserts pool" policy can't SELECT the row back or self-insert
--    membership, so the whole step happens here atomically).
create or replace function public.create_pool_draft(
  p_name        text,
  p_description text  default null,
  p_kind        text  default 'treasury',
  p_policy      jsonb default null,
  p_rules_text  text  default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_pool uuid;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required'; end if;

  insert into public.pools (contract_id, name, description, kind, policy, rules_text, created_by, status)
  values (null, trim(p_name), p_description, p_kind, p_policy, p_rules_text, v_uid, 'draft')
  returning id into v_pool;

  insert into public.pool_members (pool_id, user_id, role)
  values (v_pool, v_uid, 'officer');

  return v_pool;
end;
$$;
revoke execute on function public.create_pool_draft(text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_pool_draft(text, text, text, jsonb, text) to authenticated, service_role;

-- 5) A member sets their own signing address (officer-only roster policy blocks
--    a plain member's direct UPDATE). Address must be one of the caller's
--    verified wallets; officer addresses freeze once the pool leaves draft
--    (the on-chain officer set can no longer change).
create or replace function public.set_my_pool_address(p_pool uuid, p_address text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_status text;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select m.role into v_role
  from public.pool_members m
  where m.pool_id = p_pool and m.user_id = v_uid;
  if not found then raise exception 'not a member'; end if;

  if not exists (
    select 1 from public.user_wallets w
    where w.user_id = v_uid and w.stellar_address = p_address and w.verified_at is not null
  ) then raise exception 'address is not a verified wallet'; end if;

  select p.status into v_status from public.pools p where p.id = p_pool;
  if v_role = 'officer' and v_status <> 'draft' then
    raise exception 'officer addresses are locked after deploy';
  end if;

  update public.pool_members set stellar_address = p_address
  where pool_id = p_pool and user_id = v_uid;
end;
$$;
revoke execute on function public.set_my_pool_address(uuid, text) from public, anon;
grant execute on function public.set_my_pool_address(uuid, text) to authenticated, service_role;

-- 6) Flip a deployable draft to active once the contract exists on-chain.
--    Race-guarded (FOR UPDATE + contract_id null check); requires ≥2 officers,
--    all with linked addresses — mirroring what initialize() was called with.
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

  if (select count(*) from public.pool_members m
      where m.pool_id = p_pool and m.role = 'officer') < 2 then
    raise exception 'need at least 2 officers';
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

-- 7) preview_pool: also preview drafts (officer invites are sent pre-deploy).
create or replace function public.preview_pool(p_code text)
returns table (pool_id uuid, name text, description text, kind text, member_count bigint, role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.description, p.kind,
         (select count(*) from public.pool_members m where m.pool_id = p.id),
         i.role
  from public.pool_invites i
  join public.pools p on p.id = i.pool_id
  where i.code = p_code
    and (i.expires_at is null or i.expires_at > now())
    and i.used_count < i.max_uses
    and p.status in ('draft','active');
$$;

-- 8) redeem_invite: accept drafts; optional verified-address check; bump
--    used_count exactly once per user (idempotent re-redeems no longer consume
--    seats — fixes the 0001 test-matrix requirement); notify existing officers.
create or replace function public.redeem_invite(p_code text, p_address text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := (select auth.uid());
  v_invite   public.pool_invites%rowtype;
  v_redeemed uuid;
  v_pool_name text;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select i.* into v_invite
  from public.pool_invites i
  join public.pools p on p.id = i.pool_id
  where i.code = p_code
    and (i.expires_at is null or i.expires_at > now())
    and i.used_count < i.max_uses
    and p.status in ('draft','active')
  for update of i;

  if not found then raise exception 'invalid or exhausted invite'; end if;

  if p_address is not null and not exists (
    select 1 from public.user_wallets w
    where w.user_id = v_uid and w.stellar_address = p_address and w.verified_at is not null
  ) then raise exception 'address is not a verified wallet'; end if;

  insert into public.pool_members (pool_id, user_id, role, stellar_address, invited_by)
  values (v_invite.pool_id, v_uid, v_invite.role, p_address, v_invite.created_by)
  on conflict (pool_id, user_id) do nothing;

  insert into public.invite_redemptions (invite_id, redeemed_by)
  values (v_invite.id, v_uid)
  on conflict (invite_id, redeemed_by) do nothing
  returning id into v_redeemed;

  if v_redeemed is not null then
    update public.pool_invites set used_count = used_count + 1 where id = v_invite.id;

    select p.name into v_pool_name from public.pools p where p.id = v_invite.pool_id;
    insert into public.notifications (user_id, type, title, body, payload)
    select m.user_id, 'member_joined', 'New member joined',
           coalesce((select pr.display_name from public.profiles pr where pr.id = v_uid), 'Someone')
             || ' joined ' || v_pool_name,
           jsonb_build_object('pool_id', v_invite.pool_id, 'user_id', v_uid)
    from public.pool_members m
    where m.pool_id = v_invite.pool_id and m.role = 'officer' and m.user_id <> v_uid;
  end if;

  return v_invite.pool_id;
end;
$$;

-- 9) Feature flag: multi-pool UI stays dark until flipped post-freeze.
insert into public.feature_flags (key, enabled) values ('multi_pool', false)
on conflict (key) do nothing;
