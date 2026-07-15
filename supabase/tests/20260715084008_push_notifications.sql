-- Supabase-only notification delivery schema smoke test.
-- Run against a disposable local database after `supabase db reset`.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    raise exception 'notifications is not in supabase_realtime publication';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('authenticated', 'public.push_deliveries', 'select') then
    raise exception 'authenticated must not read push_deliveries';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.claim_push_delivery(bigint, uuid)',
    'execute'
  ) then
    raise exception 'authenticated must not execute claim_push_delivery';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.tg_push_notification_webhook()',
    'execute'
  ) then
    raise exception 'authenticated must not execute tg_push_notification_webhook';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'push_notification_webhook'
      and tgrelid = 'public.notifications'::regclass
      and not tgisinternal
  ) then
    raise exception 'push notification webhook trigger is missing';
  end if;
end;
$$;

rollback;
