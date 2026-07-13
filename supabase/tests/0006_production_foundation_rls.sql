-- Production-foundation RLS smoke test.
-- Run against a disposable local Supabase database after `supabase db reset`.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'member@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Member"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'outsider@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Outsider"}', now(), now());

update public.profiles set is_email_verified = true
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);

insert into public.pools (id, name, created_by, status) values
  ('20000000-0000-0000-0000-000000000001', 'RLS test pool', '10000000-0000-0000-0000-000000000001', 'draft');

insert into public.pool_members (pool_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'member');

insert into public.pool_categories (id, pool_id, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Supplies');

insert into public.pool_signers (id, pool_id, user_id, status) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'invited');

insert into public.user_consents (user_id, kind, version, granted) values
  ('10000000-0000-0000-0000-000000000001', 'terms', 'test', true),
  ('10000000-0000-0000-0000-000000000002', 'terms', 'test', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

do $$
declare visible_rows int;
begin
  select count(*) into visible_rows from public.pool_categories;
  if visible_rows <> 1 then
    raise exception 'member should read exactly one pool category, got %', visible_rows;
  end if;

  select count(*) into visible_rows from public.user_consents;
  if visible_rows <> 1 then
    raise exception 'member should read only their own consent, got %', visible_rows;
  end if;

  begin
    insert into public.pool_categories (pool_id, name)
    values ('20000000-0000-0000-0000-000000000001', 'Unauthorized');
    raise exception 'ordinary member unexpectedly wrote pool policy';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
do $$
declare visible_rows int;
begin
  select count(*) into visible_rows from public.pool_categories;
  if visible_rows <> 0 then
    raise exception 'outsider read cross-pool policy rows: %', visible_rows;
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
insert into public.pool_categories (pool_id, name)
values ('20000000-0000-0000-0000-000000000001', 'Owner-created');

update public.pool_signers set status = 'ready'
where id = '40000000-0000-0000-0000-000000000001';

reset role;
update public.pools set status = 'active'
where id = '20000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare changed_rows int;
begin
  update public.pool_signers set status = 'removed'
  where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'signer metadata changed after pool activation';
  end if;
end;
$$;

rollback;
