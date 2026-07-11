-- Kolektibo — custom email verification + password-reset codes.
-- Replaces Supabase-native email confirmation: our own `is_email_verified` flag becomes the
-- SOLE verification authority (Supabase flips to mailer_autoconfirm=true separately). 6-digit
-- codes for both verify + reset are issued and checked by the backend using the service role
-- only. Additive — the native flow keeps working until the frontend swap ships.

-- 1) Verification flag + backfill from the native confirmation state.
alter table public.profiles add column is_email_verified boolean not null default false;
update public.profiles p
  set is_email_verified = true
  from auth.users u
  where u.id = p.id and u.email_confirmed_at is not null;

-- 2) Column-level lock. The "own profile write" RLS policy stays (row scoping), but a user must
--    NOT be able to flip is_email_verified through that UPDATE. Grant only the editable columns.
revoke update on table public.profiles from anon, authenticated;
grant update (display_name, avatar_url, phone, locale) on table public.profiles to authenticated;

-- 3) One-time codes — service-role only (RLS on, no policies, table grants revoked).
create table public.auth_email_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  purpose     text not null check (purpose in ('verify_email','reset_password')),
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);
create index auth_email_codes_active_idx on public.auth_email_codes (user_id, purpose)
  where consumed_at is null;
alter table public.auth_email_codes enable row level security;
revoke all on table public.auth_email_codes from anon, authenticated;

-- 4) email -> uid lookup (PostgREST can't see the auth schema; profiles has no email column).
--    SECURITY DEFINER; service_role execute only (service_role does NOT bypass grants).
create or replace function public.get_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  order by u.created_at
  limit 1;
$$;
revoke execute on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;
