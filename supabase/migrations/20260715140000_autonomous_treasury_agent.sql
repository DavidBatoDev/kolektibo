-- Autonomous treasury agent foundation
-- ---------------------------------------------------------------------------
-- The database stores scheduling, conversations, and an audit/read model.
-- Actual payment authority is a threshold-approved mandate in treasury v2.

-- Preserve every contract a pool has used so upgrades do not erase history.
create table public.pool_contracts (
  id             uuid primary key default gen_random_uuid(),
  pool_id        uuid not null references public.pools(id) on delete cascade,
  contract_id    text not null unique check (contract_id ~ '^C[A-Z2-7]{55}$'),
  version        int not null check (version > 0),
  status         text not null default 'active' check (status in ('staging','active','legacy')),
  activated_at   timestamptz,
  retired_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (pool_id, contract_id)
);
create unique index pool_contracts_one_active_idx on public.pool_contracts(pool_id) where status = 'active';
create index pool_contracts_pool_idx on public.pool_contracts(pool_id, created_at desc);

insert into public.pool_contracts (pool_id, contract_id, version, status, activated_at)
select id, contract_id, contract_version, 'active', coalesce(deployed_at, created_at)
from public.pools
where contract_id is not null
on conflict (contract_id) do nothing;

create table public.pool_agent_upgrades (
  pool_id          uuid primary key references public.pools(id) on delete cascade,
  old_contract_id  text not null,
  new_contract_id  text not null unique,
  status           text not null default 'transferring'
    check (status in ('transferring','ready','completed','failed')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  last_error       text
);

-- Browser roles intentionally receive no grants or policies on this table.
create table public.agent_identities (
  pool_id            uuid primary key references public.pools(id) on delete cascade,
  public_address     text not null unique check (public_address ~ '^G[A-Z2-7]{55}$'),
  encrypted_secret   text not null,
  encryption_iv      text not null,
  encryption_tag     text not null,
  key_version        int not null default 1,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz
);

create table public.agent_mandates (
  id                  uuid primary key default gen_random_uuid(),
  pool_id             uuid not null references public.pools(id) on delete cascade,
  contract_id         text,
  mandate_id          int,
  proposal_id         int,
  action_proposal_id  int,
  pending_action      text check (pending_action in ('resume','revoke')),
  title               text not null check (char_length(title) between 1 and 120),
  recipient           text not null check (recipient ~ '^G[A-Z2-7]{55}$'),
  payee_name          text,
  category            text not null,
  amount              numeric not null check (amount > 0),
  schedule             jsonb not null default '{"type":"once"}'::jsonb,
  conditions           jsonb not null default '[]'::jsonb,
  condition_hash       text not null check (condition_hash ~ '^[0-9a-f]{64}$'),
  not_before           timestamptz not null,
  next_due_at          timestamptz,
  expires_at           timestamptz,
  max_executions       int not null default 1 check (max_executions > 0),
  execution_count      int not null default 0 check (execution_count >= 0),
  min_balance          numeric not null default 0 check (min_balance >= 0),
  status               text not null default 'draft'
    check (status in ('draft','proposed','active','paused','revoked','completed','failed')),
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (contract_id, mandate_id)
);
create index agent_mandates_due_idx on public.agent_mandates(next_due_at)
  where status = 'active' and next_due_at is not null;
create index agent_mandates_pool_idx on public.agent_mandates(pool_id, created_at desc);
create trigger set_updated_at before update on public.agent_mandates
  for each row execute function public.tg_set_updated_at();

create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete set null,
  pool_id         uuid references public.pools(id) on delete cascade,
  visibility      text not null default 'private' check (visibility in ('private','pool')),
  trigger         text not null check (trigger in ('chat','schedule','activity','manual')),
  status          text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled')),
  prompt          text,
  response        text,
  error           text,
  input_tokens    int not null default 0,
  output_tokens   int not null default 0,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index agent_runs_user_idx on public.agent_runs(user_id, created_at desc);
create index agent_runs_pool_idx on public.agent_runs(pool_id, created_at desc);

create table public.agent_run_steps (
  id          bigint generated always as identity primary key,
  run_id      uuid not null references public.agent_runs(id) on delete cascade,
  pool_id     uuid references public.pools(id) on delete cascade,
  sequence    int not null,
  kind        text not null check (kind in ('status','tool_call','tool_result','transaction','answer')),
  tool_name   text,
  title       text not null,
  status      text not null default 'completed' check (status in ('pending','running','completed','failed','blocked')),
  input       jsonb,
  output      jsonb,
  tx_hash     text,
  created_at  timestamptz not null default now(),
  unique (run_id, sequence)
);
create index agent_run_steps_run_idx on public.agent_run_steps(run_id, sequence);

create table public.agent_executions (
  id            uuid primary key default gen_random_uuid(),
  mandate_id    uuid not null references public.agent_mandates(id) on delete cascade,
  run_id        uuid references public.agent_runs(id) on delete set null,
  due_at        timestamptz not null,
  status        text not null default 'claimed'
    check (status in ('claimed','submitted','confirmed','failed','skipped')),
  claim_token   uuid not null,
  claimed_at    timestamptz not null default now(),
  attempts      int not null default 1 check (attempts > 0),
  tx_hash       text,
  error         text,
  updated_at    timestamptz not null default now(),
  unique (mandate_id, due_at)
);
create trigger set_updated_at before update on public.agent_executions
  for each row execute function public.tg_set_updated_at();

alter table public.pool_contracts enable row level security;
alter table public.pool_agent_upgrades enable row level security;
alter table public.agent_identities enable row level security;
alter table public.agent_mandates enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_steps enable row level security;
alter table public.agent_executions enable row level security;

create policy "member reads contract history" on public.pool_contracts for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "member reads agent upgrades" on public.pool_agent_upgrades for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "member reads agent mandates" on public.agent_mandates for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "user or pool member reads agent runs" on public.agent_runs for select to authenticated
  using (
    (visibility = 'private' and user_id = (select auth.uid()))
    or (visibility = 'pool' and pool_id is not null and public.is_pool_member(pool_id))
  );
create policy "user or pool member reads agent steps" on public.agent_run_steps for select to authenticated
  using (exists (
    select 1 from public.agent_runs r
    where r.id = agent_run_steps.run_id
      and (
        (r.visibility = 'private' and r.user_id = (select auth.uid()))
        or (r.visibility = 'pool' and r.pool_id is not null and public.is_pool_member(r.pool_id))
      )
  ));
create policy "member reads agent executions" on public.agent_executions for select to authenticated
  using (exists (
    select 1 from public.agent_mandates m
    where m.id = agent_executions.mandate_id and public.is_pool_member(m.pool_id)
  ));

grant select on public.pool_contracts, public.pool_agent_upgrades, public.agent_mandates, public.agent_runs,
  public.agent_run_steps, public.agent_executions to authenticated;
grant all on public.pool_contracts, public.pool_agent_upgrades, public.agent_identities,
  public.agent_mandates, public.agent_runs, public.agent_run_steps, public.agent_executions to service_role;
grant usage, select on sequence public.agent_run_steps_id_seq to service_role;
revoke all on public.agent_identities from public, anon, authenticated;

-- Contract history now drives event visibility, including retired v1 contracts.
drop policy if exists "member reads events" on public.chain_events;
create policy "member reads events" on public.chain_events for select to authenticated
  using (exists (
    select 1 from public.pool_contracts pc
    where pc.contract_id = chain_events.contract_id and public.is_pool_member(pc.pool_id)
  ));

-- Atomically claim one due payment. Only the always-on service may call this.
create or replace function public.claim_due_agent_execution(p_claim_token uuid)
returns table (
  execution_id uuid,
  mandate_uuid uuid,
  pool_uuid uuid,
  due_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_mandate public.agent_mandates%rowtype;
  v_execution uuid;
begin
  select m.* into v_mandate
  from public.agent_mandates m
  where m.status = 'active'
    and m.next_due_at is not null
    and m.next_due_at <= now()
    and m.execution_count < m.max_executions
    and (m.expires_at is null or m.expires_at >= now())
    and not exists (
      select 1 from public.agent_executions e
      where e.mandate_id = m.id and e.due_at = m.next_due_at
    )
  order by m.next_due_at, m.id
  for update skip locked
  limit 1;

  if not found then return; end if;
  insert into public.agent_executions (mandate_id, due_at, claim_token)
  values (v_mandate.id, v_mandate.next_due_at, p_claim_token)
  returning id into v_execution;

  return query select v_execution, v_mandate.id, v_mandate.pool_id, v_mandate.next_due_at;
end;
$$;
revoke execute on function public.claim_due_agent_execution(uuid) from public, anon, authenticated;
grant execute on function public.claim_due_agent_execution(uuid) to service_role;

-- Complete a v1 -> v2 cutover as one database transaction after the service
-- has independently verified that the old on-chain balance is zero.
create or replace function public.finalize_pool_agent_upgrade(p_pool_id uuid, p_wasm_hash text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_upgrade public.pool_agent_upgrades%rowtype;
begin
  select * into v_upgrade from public.pool_agent_upgrades
  where pool_id = p_pool_id for update;
  if not found then raise exception 'Agent upgrade not found'; end if;
  if v_upgrade.status = 'completed' then return v_upgrade.new_contract_id; end if;

  update public.pool_contracts
  set status = 'legacy', retired_at = now()
  where pool_id = p_pool_id and contract_id = v_upgrade.old_contract_id and status = 'active';
  if not found then raise exception 'Active v1 contract history does not match the upgrade'; end if;

  update public.pool_contracts
  set status = 'active', activated_at = now(), retired_at = null
  where pool_id = p_pool_id and contract_id = v_upgrade.new_contract_id and status = 'staging';
  if not found then raise exception 'Staged v2 contract history does not match the upgrade'; end if;

  update public.pools
  set contract_id = v_upgrade.new_contract_id, contract_version = 2,
      wasm_hash = p_wasm_hash, deployed_at = now()
  where id = p_pool_id and contract_id = v_upgrade.old_contract_id and contract_version = 1;
  if not found then raise exception 'Pool contract changed while the upgrade was finalizing'; end if;

  update public.pool_agent_upgrades
  set status = 'completed', completed_at = now(), last_error = null
  where pool_id = p_pool_id;
  return v_upgrade.new_contract_id;
end;
$$;
revoke execute on function public.finalize_pool_agent_upgrade(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_pool_agent_upgrade(uuid, text) to service_role;

-- Agent runs and steps are delivered through the existing Supabase Realtime channel.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_runs'
  ) then alter publication supabase_realtime add table public.agent_runs; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_run_steps'
  ) then alter publication supabase_realtime add table public.agent_run_steps; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_mandates'
  ) then alter publication supabase_realtime add table public.agent_mandates; end if;
end;
$$;

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('ask','rules','agent'));

insert into public.feature_flags (key, enabled, payload)
values ('treasury_agent_v1', true, '{"network":"testnet","autonomy":"delegated_mandates"}'::jsonb)
on conflict (key) do update set enabled = excluded.enabled, payload = excluded.payload;
