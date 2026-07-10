-- Kolektibo — Supabase schema v1 (identity · directory · metadata · read-models)
-- ---------------------------------------------------------------------------
-- ARCHITECTURE LAW: this database holds ZERO authority over money. Every money
-- fact is derived from the Soroban contracts on Stellar. If this DB is wiped,
-- not one centavo is at risk. Rows that mirror chain state are keyed by on-chain
-- identifiers (contract_id, tx_hash, spend_id) and are written only by the
-- indexer/backend (service role) — never by clients.
--
-- Conventions: text + CHECK (not enums, cheaper migrations); updated_at via
-- trigger on mutable tables; RLS enabled on EVERY table; policies use
-- (select auth.uid()) [initplan-safe] and `to authenticated`; cross-table
-- membership checks go through SECURITY DEFINER STABLE helpers (search_path='')
-- to avoid recursive-policy errors. See the RLS TEST MATRIX at the bottom.
-- ---------------------------------------------------------------------------

-- ============================ shared functions =============================

-- Generic updated_at stamper.
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create a profile row for every new auth user (incl. anonymous).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1),
             'New member')
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ================================ profiles =================================

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member',
  avatar_url   text,
  phone        text,
  locale       text not null default 'en' check (locale in ('en','tl')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create table public.user_settings (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  currency_display text not null default 'PHP',
  theme            text not null default 'dark' check (theme in ('dark','light','auto')),
  notif_prefs      jsonb not null default '{"push":true,"approval":true,"contribution":true,"release":true}',
  updated_at       timestamptz not null default now()
);
create trigger set_updated_at before update on public.user_settings
  for each row execute function public.tg_set_updated_at();

create table public.user_wallets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  stellar_address text not null unique,
  kind           text not null default 'legacy_local' check (kind in ('passkey','external','legacy_local')),
  label          text,
  is_primary     boolean not null default false,
  verified_at    timestamptz,               -- set once a proof-of-ownership challenge passes
  created_at     timestamptz not null default now()
);
create index user_wallets_user_idx on public.user_wallets(user_id);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,                -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- ============================ pools & membership ===========================

create table public.pools (
  id               uuid primary key default gen_random_uuid(),
  contract_id      text not null unique,     -- Soroban contract address
  network          text not null default 'testnet' check (network in ('testnet','mainnet')),
  name             text not null,
  description      text,
  kind             text not null default 'treasury' check (kind in ('treasury','paluwagan')),
  currency_label   text not null default 'USDC',
  policy           jsonb,                    -- display copy of the on-chain policy
  rules_text       text,                     -- original plain-language rules
  contract_version int not null default 1,
  wasm_hash        text,
  created_by       uuid references public.profiles(id) on delete set null,
  status           text not null default 'active' check (status in ('active','migrated','archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger set_updated_at before update on public.pools
  for each row execute function public.tg_set_updated_at();
create index pools_status_idx on public.pools(status);

create table public.pool_members (
  pool_id              uuid not null references public.pools(id) on delete cascade,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  role                 text not null default 'member' check (role in ('officer','member')),
  stellar_address      text,                 -- this member's signing address in this pool
  display_name_override text,
  joined_at            timestamptz not null default now(),
  invited_by           uuid references public.profiles(id) on delete set null,
  primary key (pool_id, user_id)
);
create index pool_members_user_idx on public.pool_members(user_id, pool_id);

create table public.pool_invites (
  id         uuid primary key default gen_random_uuid(),
  pool_id    uuid not null references public.pools(id) on delete cascade,
  code       text not null unique,
  role       text not null default 'member' check (role in ('officer','member')),
  max_uses   int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index pool_invites_pool_idx on public.pool_invites(pool_id);

create table public.invite_redemptions (
  id          uuid primary key default gen_random_uuid(),
  invite_id   uuid not null references public.pool_invites(id) on delete cascade,
  redeemed_by uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invite_id, redeemed_by)
);

create table public.payees (
  id              uuid primary key default gen_random_uuid(),
  pool_id         uuid not null references public.pools(id) on delete cascade,
  name            text not null,
  stellar_address text not null,
  notes           text,
  verified        boolean not null default false,
  created_at      timestamptz not null default now()
);
create index payees_pool_idx on public.payees(pool_id);

-- ========================= chain read-model (indexer) ======================

create table public.chain_events (
  id           bigint generated always as identity primary key,
  contract_id  text not null,
  event_type   text not null,               -- contrib | spend_req | approve | execute | ...
  tx_hash      text not null,
  ledger       bigint not null,
  tx_index     int not null default 0,
  op_index     int not null default 0,
  event_index  int not null default 0,
  payload      jsonb,
  occurred_at  timestamptz not null default now(),
  -- batch-safe: two events in one tx differ by (op_index, event_index)
  unique (contract_id, ledger, tx_index, op_index, event_index)
);
create index chain_events_contract_ledger_idx on public.chain_events(contract_id, ledger);

create table public.indexer_cursor (
  contract_id         text primary key,
  last_ledger         bigint not null default 0,
  last_event_position text,
  updated_at          timestamptz not null default now()
);

create table public.spend_meta (
  pool_id      uuid not null references public.pools(id) on delete cascade,
  spend_id     integer not null,            -- on-chain u32 spend id
  receipt_urls text[] not null default '{}',
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (pool_id, spend_id)
);

create table public.contribution_meta (
  pool_id   uuid not null references public.pools(id) on delete cascade,
  tx_hash   text not null,
  proof_url text,
  note      text,
  created_at timestamptz not null default now(),
  primary key (pool_id, tx_hash)
);

-- =============================== paluwagan =================================

create table public.paluwagan_cycles (
  id             uuid primary key default gen_random_uuid(),
  pool_id        uuid not null references public.pools(id) on delete cascade,
  cycle_no       int not null,
  payout_user_id uuid references public.profiles(id) on delete set null,
  payout_address text,
  due_amount     numeric,
  due_date       date,
  payout_tx_hash text,
  payout_order   jsonb,                      -- ordered list of addresses
  order_proof    text,                       -- commit-reveal proof of the draw
  status         text not null default 'pending' check (status in ('pending','collecting','paid','skipped')),
  created_at     timestamptz not null default now(),
  unique (pool_id, cycle_no)
);
create index paluwagan_cycles_pool_idx on public.paluwagan_cycles(pool_id);

create table public.cycle_contributions (
  id              uuid primary key default gen_random_uuid(),
  cycle_id        uuid not null references public.paluwagan_cycles(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  stellar_address text,
  status          text not null default 'due' check (status in ('due','paid','late')),
  tx_hash         text,
  paid_at         timestamptz,
  unique (cycle_id, stellar_address)
);
create index cycle_contributions_cycle_idx on public.cycle_contributions(cycle_id);

-- ===================== usage / notifications / admin =======================

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  pool_id    uuid references public.pools(id) on delete set null,
  kind       text not null check (kind in ('ask','rules')),
  tokens     int not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage(user_id, created_at);

create table public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications(user_id) where read_at is null;

create table public.audit_log (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references public.profiles(id) on delete set null,
  actor_tombstone text,                      -- label kept after user erasure
  action         text not null,
  target         text,
  meta           jsonb,
  created_at     timestamptz not null default now()
);

create table public.feature_flags (
  key       text primary key,
  enabled   boolean not null default false,
  payload   jsonb,
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.feature_flags
  for each row execute function public.tg_set_updated_at();

-- ====================== membership helper functions ========================
-- SECURITY DEFINER + STABLE + search_path='' : reads membership WITHOUT
-- re-triggering RLS (prevents "infinite recursion detected in policy").

create or replace function public.is_pool_member(p_pool uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pool_members m
    where m.pool_id = p_pool and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_pool_officer(p_pool uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pool_members m
    where m.pool_id = p_pool and m.user_id = (select auth.uid()) and m.role = 'officer'
  );
$$;

-- Do the current user and p_other share any pool? (for co-member profile reads)
create or replace function public.shares_pool(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pool_members a
    join public.pool_members b on a.pool_id = b.pool_id
    where a.user_id = (select auth.uid()) and b.user_id = p_other
  );
$$;

-- ================================ enable RLS ===============================

alter table public.profiles           enable row level security;
alter table public.user_settings       enable row level security;
alter table public.user_wallets        enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.pools               enable row level security;
alter table public.pool_members        enable row level security;
alter table public.pool_invites        enable row level security;
alter table public.invite_redemptions  enable row level security;
alter table public.payees              enable row level security;
alter table public.chain_events        enable row level security;
alter table public.indexer_cursor      enable row level security;
alter table public.spend_meta          enable row level security;
alter table public.contribution_meta   enable row level security;
alter table public.paluwagan_cycles    enable row level security;
alter table public.cycle_contributions enable row level security;
alter table public.ai_usage            enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_log           enable row level security;
alter table public.feature_flags       enable row level security;

-- =============================== RLS policies ==============================
-- Owner-only (profiles / settings / wallets / push / ai_usage / notifications)

create policy "own profile read"   on public.profiles for select to authenticated using ( id = (select auth.uid()) );
create policy "own profile write"  on public.profiles for update to authenticated using ( id = (select auth.uid()) ) with check ( id = (select auth.uid()) );
-- co-members can read each other's basic profile (for names/avatars in a pool)
create policy "comember profile read" on public.profiles for select to authenticated
  using ( public.shares_pool(id) );

create policy "own settings" on public.user_settings for all to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

create policy "own wallets" on public.user_wallets for all to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

create policy "own push" on public.push_subscriptions for all to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

create policy "own ai_usage read" on public.ai_usage for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy "own notifications" on public.notifications for all to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );

-- Pools & membership (member-read, officer-write)
create policy "member reads pool" on public.pools for select to authenticated
  using ( public.is_pool_member(id) );
create policy "creator inserts pool" on public.pools for insert to authenticated
  with check ( created_by = (select auth.uid()) );
create policy "officer updates pool" on public.pools for update to authenticated
  using ( public.is_pool_officer(id) ) with check ( public.is_pool_officer(id) );

create policy "member reads roster" on public.pool_members for select to authenticated
  using ( public.is_pool_member(pool_id) );
create policy "officer manages roster" on public.pool_members for all to authenticated
  using ( public.is_pool_officer(pool_id) ) with check ( public.is_pool_officer(pool_id) );

-- Invites: officers manage; NOT blanket-readable (codes leak roles). Redemption
-- + anonymous preview happen only through the SECURITY DEFINER RPCs below.
create policy "officer manages invites" on public.pool_invites for all to authenticated
  using ( public.is_pool_officer(pool_id) ) with check ( public.is_pool_officer(pool_id) );

create policy "member reads redemptions" on public.invite_redemptions for select to authenticated
  using ( exists (select 1 from public.pool_invites i where i.id = invite_id and public.is_pool_member(i.pool_id)) );

create policy "member reads payees" on public.payees for select to authenticated
  using ( public.is_pool_member(pool_id) );
create policy "officer writes payees" on public.payees for all to authenticated
  using ( public.is_pool_officer(pool_id) ) with check ( public.is_pool_officer(pool_id) );

-- Chain read-model: members read; only the indexer (service role) writes.
create policy "member reads events" on public.chain_events for select to authenticated
  using ( exists (select 1 from public.pools p where p.contract_id = chain_events.contract_id and public.is_pool_member(p.id)) );

create policy "member reads spend_meta" on public.spend_meta for select to authenticated
  using ( public.is_pool_member(pool_id) );
create policy "officer writes spend_meta" on public.spend_meta for all to authenticated
  using ( public.is_pool_officer(pool_id) ) with check ( public.is_pool_officer(pool_id) );

create policy "member reads contrib_meta" on public.contribution_meta for select to authenticated
  using ( public.is_pool_member(pool_id) );
create policy "member writes contrib_meta" on public.contribution_meta for insert to authenticated
  with check ( public.is_pool_member(pool_id) );

-- Paluwagan
create policy "member reads cycles" on public.paluwagan_cycles for select to authenticated
  using ( public.is_pool_member(pool_id) );
create policy "officer writes cycles" on public.paluwagan_cycles for all to authenticated
  using ( public.is_pool_officer(pool_id) ) with check ( public.is_pool_officer(pool_id) );

create policy "member reads cycle_contribs" on public.cycle_contributions for select to authenticated
  using ( exists (select 1 from public.paluwagan_cycles c where c.id = cycle_id and public.is_pool_member(c.pool_id)) );

-- Feature flags: readable by any signed-in client; only service role writes.
create policy "read flags" on public.feature_flags for select to authenticated using ( true );

-- NOTE: indexer_cursor, audit_log, and all *write* paths for chain_events /
-- cycle_contributions / paluwagan payout have NO authenticated policy → only the
-- service role (which bypasses RLS) can touch them. This is intentional.

-- ================================== RPCs ===================================
-- Anonymous/pre-member access is granted ONLY through these, never via policy.

-- Preview a pool from an unexpired invite code (works for anonymous sessions).
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
    and p.status = 'active';
$$;

-- Atomically redeem an invite: join the pool, bump used_count, record redemption.
create or replace function public.redeem_invite(p_code text, p_address text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_invite public.pool_invites%rowtype;
begin
  if v_uid is null then raise exception 'auth required'; end if;

  select * into v_invite from public.pool_invites
  where code = p_code
    and (expires_at is null or expires_at > now())
    and used_count < max_uses
  for update;

  if not found then raise exception 'invalid or exhausted invite'; end if;

  insert into public.pool_members (pool_id, user_id, role, stellar_address, invited_by)
  values (v_invite.pool_id, v_uid, v_invite.role, p_address, v_invite.created_by)
  on conflict (pool_id, user_id) do nothing;

  insert into public.invite_redemptions (invite_id, redeemed_by)
  values (v_invite.id, v_uid)
  on conflict (invite_id, redeemed_by) do nothing;

  update public.pool_invites set used_count = used_count + 1 where id = v_invite.id;

  return v_invite.pool_id;
end;
$$;

-- Trigger to auto-provision profile + settings on new auth user.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- RLS TEST MATRIX (implement as an automated allow/deny suite in Phase 1)
-- ---------------------------------------------------------------------------
-- Table              | anon        | member (own pool) | officer (own pool) | other user
-- profiles           | -           | R own + comembers | R+U own            | R own only
-- user_settings      | -           | RW own            | RW own             | none
-- user_wallets       | -           | RW own            | RW own             | none
-- pools              | preview RPC | R                 | R+U                | none
-- pool_members       | -           | R                 | RW                 | none
-- pool_invites       | preview RPC | none              | RW                 | none
-- invite_redemptions | -           | R                 | R                  | none
-- payees             | -           | R                 | RW                 | none
-- chain_events       | -           | R                 | R                  | none  (write: service only)
-- spend_meta         | -           | R                 | RW                 | none
-- contribution_meta  | -           | R + insert        | R + insert         | none
-- paluwagan_cycles   | -           | R                 | RW                 | none
-- cycle_contributions| -           | R                 | R                  | none  (write: service only)
-- ai_usage           | -           | R own             | R own              | none  (write: service only)
-- notifications      | -           | RW own            | RW own             | none
-- audit_log          | -           | none              | none               | none  (service only)
-- indexer_cursor     | -           | none              | none               | none  (service only)
-- feature_flags      | -           | R                 | R                  | R     (write: service only)
-- redeem_invite RPC  : must bump used_count exactly once and be idempotent per user.
-- ===========================================================================
