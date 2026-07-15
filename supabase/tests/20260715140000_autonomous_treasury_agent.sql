-- Autonomous Agent RLS and due-execution claim smoke test.
-- Run against a disposable database after `supabase db reset`.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'agent-officer@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Officer"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'agent-member@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'agent-outsider@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Outsider"}', now(), now());

insert into public.pools (id, contract_id, contract_version, name, status, created_by)
values ('62000000-0000-0000-0000-000000000001', 'C' || repeat('A', 55), 2, 'Agent test pool', 'active', '61000000-0000-0000-0000-000000000001');
insert into public.pool_members (pool_id, user_id, role) values
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'officer'),
  ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', 'member');
insert into public.pool_contracts (pool_id, contract_id, version, status, activated_at)
values ('62000000-0000-0000-0000-000000000001', 'C' || repeat('A', 55), 2, 'active', now());
insert into public.agent_identities (pool_id, public_address, encrypted_secret, encryption_iv, encryption_tag)
values ('62000000-0000-0000-0000-000000000001', 'G' || repeat('A', 55), 'ciphertext', 'iv', 'tag');
insert into public.agent_mandates (
  id, pool_id, contract_id, mandate_id, title, recipient, category, amount,
  condition_hash, not_before, next_due_at, status, created_by
) values (
  '63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001',
  'C' || repeat('A', 55), 1, 'Weekly supplies', 'G' || repeat('B', 55), 'Equipment', 100,
  repeat('0', 64), now() - interval '1 minute', now() - interval '1 minute', 'active',
  '61000000-0000-0000-0000-000000000001'
);
insert into public.agent_runs (id, user_id, visibility, trigger, status, prompt)
values ('64000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'private', 'chat', 'completed', 'private question');
insert into public.agent_runs (id, pool_id, visibility, trigger, status, prompt)
values ('64000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 'pool', 'schedule', 'completed', 'pool run');
insert into public.agent_run_steps (run_id, pool_id, sequence, kind, title)
values ('64000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001', 1, 'tool_call', 'Execute mandate');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
declare visible int;
begin
  select count(*) into visible from public.agent_mandates;
  if visible <> 1 then raise exception 'member should see the pool mandate'; end if;
  select count(*) into visible from public.agent_runs;
  if visible <> 1 then raise exception 'member should see only the pool-visible run, got %', visible; end if;
  select count(*) into visible from public.agent_run_steps;
  if visible <> 1 then raise exception 'member should see the pool-visible tool step'; end if;
  begin
    perform * from public.agent_identities;
    raise exception 'browser role read encrypted agent keys';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.claim_due_agent_execution(gen_random_uuid());
    raise exception 'browser role claimed an autonomous execution';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.agent_mandates) <> 0 then raise exception 'outsider read mandate'; end if;
  if (select count(*) from public.agent_runs) <> 0 then raise exception 'outsider read Agent run'; end if;
end;
$$;

reset role;
set local role service_role;
do $$
declare first_count int;
declare second_count int;
begin
  select count(*) into first_count from public.claim_due_agent_execution('65000000-0000-0000-0000-000000000001');
  select count(*) into second_count from public.claim_due_agent_execution('65000000-0000-0000-0000-000000000002');
  if first_count <> 1 or second_count <> 0 then
    raise exception 'due execution claim was not idempotent: first %, second %', first_count, second_count;
  end if;
end;
$$;

rollback;
