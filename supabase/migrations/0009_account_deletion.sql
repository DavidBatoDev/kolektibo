-- 0009 — DPA-compliant account deletion
-- ---------------------------------------------------------------------------
-- Provides a `delete_my_account()` RPC that:
--   1. Blocks deletion if the caller is an active officer/owner of any pool.
--   2. Tombstones audit_log attribution (copies display_name → actor_tombstone,
--      then NULLs actor_user_id) so the audit trail survives PII erasure.
--   3. Scrubs PII from the profiles row (display_name, avatar_url, phone).
--
-- The actual auth.users deletion happens in the backend via service-role
-- admin.deleteUser(), which then triggers the FK cascades that remove the
-- profiles row and all dependent data (wallets, settings, push, notifications,
-- memberships, etc.).
--
-- IMPORTANT: authoring this migration does not apply it. Follow supabase/README
-- and obtain explicit approval before `supabase db push`.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_display_name text;
  v_blocking_pools text;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  -- 1. Officer guard: block deletion if the user is an officer/owner of any pool.
  select string_agg(p.name, ', ' order by p.name)
  into v_blocking_pools
  from public.pool_members m
  join public.pools p on p.id = m.pool_id
  where m.user_id = v_uid
    and m.role in ('owner', 'officer')
    and p.status not in ('archived', 'migrated');

  if v_blocking_pools is not null then
    raise exception 'You are an officer of: %. Transfer your role before deleting your account.',
      v_blocking_pools;
  end if;

  -- 2. Capture display name for tombstoning before we scrub it.
  select display_name into v_display_name
  from public.profiles
  where id = v_uid;

  -- 3. Tombstone audit_log: preserve the actor label, detach the FK.
  update public.audit_log
  set actor_tombstone = coalesce(v_display_name, 'Deleted user'),
      actor_user_id = null
  where actor_user_id = v_uid
    and actor_tombstone is null;

  -- 4. Scrub PII from profiles (the CASCADE from auth.users deletion will
  --    remove the row entirely, but this ensures no PII survives in
  --    replication lag or WAL).
  update public.profiles
  set display_name = 'Deleted user',
      avatar_url = null,
      phone = null
  where id = v_uid;

  -- 5. The backend will now call admin.auth.admin.deleteUser(uid) which
  --    triggers ON DELETE CASCADE from auth.users → profiles → everything.
  --    This RPC does NOT delete the auth user (requires service_role).
end;
$$;

-- Only authenticated users can call this; service_role bypasses anyway.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated, service_role;
