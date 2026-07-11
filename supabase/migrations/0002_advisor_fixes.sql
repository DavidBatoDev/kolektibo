-- Kolektibo — advisor cleanup for schema v1.
-- Clears the lints surfaced by the Supabase advisors after 0001:
--   • Security WARN 0011 (function_search_path_mutable) on tg_set_updated_at.
--   • Performance INFO 0001 (unindexed_foreign_keys) on 9 FKs.
-- Deliberately NOT changed: rls_enabled_no_policy (INFO 0008) on audit_log and
-- indexer_cursor — those are service-role-only by design (RLS on + no policy =
-- deny-all to every client role), so the "no policy" state is intended.

-- 1) Pin the trigger function's search_path (now() still resolves via pg_catalog).
alter function public.tg_set_updated_at() set search_path = '';

-- 2) Covering indexes for foreign keys flagged by the performance advisor.
create index if not exists ai_usage_pool_idx               on public.ai_usage(pool_id);
create index if not exists audit_log_actor_idx             on public.audit_log(actor_user_id);
create index if not exists cycle_contributions_user_idx    on public.cycle_contributions(user_id);
create index if not exists invite_redemptions_by_idx       on public.invite_redemptions(redeemed_by);
create index if not exists paluwagan_cycles_payout_user_idx on public.paluwagan_cycles(payout_user_id);
create index if not exists pool_invites_created_by_idx     on public.pool_invites(created_by);
create index if not exists pool_members_invited_by_idx     on public.pool_members(invited_by);
create index if not exists pools_created_by_idx            on public.pools(created_by);
create index if not exists spend_meta_created_by_idx       on public.spend_meta(created_by);
