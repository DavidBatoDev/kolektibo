-- Supabase-only notification delivery
-- ---------------------------------------------------------------------------
-- Publishes owner-scoped notifications to Realtime and records server-only
-- Web Push delivery attempts made by the Supabase Edge Function.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

create table public.push_deliveries (
  id               bigint generated always as identity primary key,
  notification_id  bigint not null references public.notifications(id) on delete cascade,
  subscription_id  uuid not null,
  status           text not null default 'pending'
    check (status in ('pending', 'sending', 'delivered', 'failed')),
  attempts         integer not null default 0 check (attempts >= 0),
  last_error       text,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (notification_id, subscription_id)
);

create index push_deliveries_notification_idx
  on public.push_deliveries(notification_id, status);

alter table public.push_deliveries enable row level security;

revoke all on table public.push_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.push_deliveries to service_role;
grant usage, select on sequence public.push_deliveries_id_seq to service_role;

-- No client policy or grant: delivery metadata is backend-only. The Edge
-- Function uses the service role and claims a row atomically before sending.
create or replace function public.claim_push_delivery(
  p_notification_id bigint,
  p_subscription_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean := false;
begin
  insert into public.push_deliveries (notification_id, subscription_id)
  values (p_notification_id, p_subscription_id)
  on conflict (notification_id, subscription_id) do nothing;

  update public.push_deliveries
  set status = 'sending',
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where notification_id = p_notification_id
    and subscription_id = p_subscription_id
    and (
      status in ('pending', 'failed')
      or (status = 'sending' and updated_at < now() - interval '5 minutes')
    )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_push_delivery(bigint, uuid) from public;
revoke all on function public.claim_push_delivery(bigint, uuid) from anon;
revoke all on function public.claim_push_delivery(bigint, uuid) from authenticated;
grant execute on function public.claim_push_delivery(bigint, uuid) to service_role;

-- Database Webhooks are pg_net triggers. The URL and dedicated authentication
-- secret are read from Vault at call time, never embedded in trigger metadata.
create extension if not exists pg_net with schema extensions;

create or replace function public.tg_push_notification_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'push_function_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_webhook_secret';

  -- Keep notification inserts non-blocking during initial deployment or secret
  -- rotation. Delivery begins as soon as both Vault values are present.
  if v_url is null or v_secret is null then
    raise warning 'push webhook Vault configuration is missing';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

revoke all on function public.tg_push_notification_webhook() from public, anon, authenticated;

create trigger push_notification_webhook
after insert on public.notifications
for each row execute function public.tg_push_notification_webhook();
