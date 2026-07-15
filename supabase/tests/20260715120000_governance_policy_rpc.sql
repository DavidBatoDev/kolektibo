-- Draft governance RPC validation/authorization smoke test.
-- Run against a disposable local database after `supabase db reset`.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'governance-owner@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Owner"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'governance-member@example.test', '', now(), '{"provider":"email"}', '{"full_name":"Member"}', now(), now());

insert into public.pools (id, name, created_by, status) values
  ('52000000-0000-0000-0000-000000000001', 'Governance RPC test', '51000000-0000-0000-0000-000000000001', 'draft');

insert into public.pool_members (pool_id, user_id, role) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'owner'),
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'member');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select public.replace_pool_governance_policy(
  '52000000-0000-0000-0000-000000000001',
  '[{"name":"Equipment","per_transaction_cap":100,"rolling_monthly_cap":500,"attachment_required":true}]'::jsonb,
  '[{"minimum_amount":0,"required_approvals":1}]'::jsonb
);

do $$
begin
  if (select count(*) from public.pool_categories where pool_id = '52000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'valid category replacement failed';
  end if;
  if (select count(*) from public.pool_approval_tiers where pool_id = '52000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'valid tier replacement failed';
  end if;

  begin
    perform public.replace_pool_governance_policy(
      '52000000-0000-0000-0000-000000000001', null, '[]'::jsonb
    );
    raise exception 'null policy was accepted';
  exception when others then
    if sqlerrm = 'null policy was accepted' or position('between 1 and 50' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.replace_pool_governance_policy(
      '52000000-0000-0000-0000-000000000001',
      '[{"name":"Equipment"}]'::jsonb,
      '[{"minimum_amount":0,"required_approvals":2}]'::jsonb
    );
    raise exception 'impossible approval threshold was accepted';
  exception when others then
    if sqlerrm = 'impossible approval threshold was accepted' or position('fit the officer count' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.replace_pool_governance_policy(
      '52000000-0000-0000-0000-000000000001',
      '[{"name":"Unauthorized"}]'::jsonb,
      '[{"minimum_amount":0,"required_approvals":1}]'::jsonb
    );
    raise exception 'ordinary member replaced governance policy';
  exception when others then
    if sqlerrm = 'ordinary member replaced governance policy' or position('officer access required' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

rollback;
