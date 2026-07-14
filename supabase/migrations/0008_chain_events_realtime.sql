-- 0008 — Enable Supabase Realtime on chain_events (E2)
-- ---------------------------------------------------------------------------
-- Adds chain_events to the supabase_realtime publication so pool members
-- receive live INSERT notifications when the indexer writes new rows.
-- Money authority remains on-chain; this is read-model delivery only.
--
-- Append-only table: clients subscribe to INSERT only (no REPLICA IDENTITY FULL).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chain_events'
  ) then
    alter publication supabase_realtime add table public.chain_events;
  end if;
end;
$$;
