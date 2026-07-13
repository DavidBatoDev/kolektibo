-- Internal trigger functions are not application RPCs.
-- Keep them callable only by their owning trigger / service role, never through
-- PostgREST by anon or authenticated users.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_user_consents_from_auth() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.sync_user_consents_from_auth() to service_role;
