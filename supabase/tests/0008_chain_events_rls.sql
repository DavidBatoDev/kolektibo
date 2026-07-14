-- chain_events RLS smoke test (member vs outsider).
-- Run against a disposable local Supabase database after `supabase db reset`.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ce-owner@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ce-member@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ce-outsider@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Outsider"}', now(), now());

update public.profiles set is_email_verified = true
where id in (
  '11000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000002',
  '11000000-0000-0000-0000-000000000003'
);

insert into public.pools (id, name, created_by, status, contract_id) values
  (
    '21000000-0000-0000-0000-000000000001',
    'chain_events RLS pool',
    '11000000-0000-0000-0000-000000000001',
    'active',
    'CTEST0000000000000000000000000000000000000000000000000000000001'
  );

insert into public.pool_members (pool_id, user_id, role) values
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'owner'),
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'member');

-- Service role (indexer) inserts an event; clients never write chain_events.
reset role;
insert into public.chain_events (
  contract_id, event_type, tx_hash, ledger, tx_index, op_index, event_index, payload
) values (
  'CTEST0000000000000000000000000000000000000000000000000000000001',
  'contrib',
  'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  12345,
  0,
  0,
  0,
  '{"from":"GTEST0000000000000000000000000000000000000000000000000000000001","amount":"1000000000"}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare visible_rows int;
begin
  select count(*) into visible_rows
  from public.chain_events
  where contract_id = 'CTEST0000000000000000000000000000000000000000000000000000000001';

  if visible_rows <> 1 then
    raise exception 'pool member should read exactly one chain_events row, got %', visible_rows;
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"11000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

do $$
declare visible_rows int;
begin
  select count(*) into visible_rows
  from public.chain_events
  where contract_id = 'CTEST0000000000000000000000000000000000000000000000000000000001';

  if visible_rows <> 0 then
    raise exception 'outsider read chain_events rows: %', visible_rows;
  end if;
end;
$$;

-- Realtime publication includes chain_events (E2 migration applied).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chain_events'
  ) then
    raise exception 'chain_events is not in supabase_realtime publication';
  end if;
end;
$$;

rollback;
