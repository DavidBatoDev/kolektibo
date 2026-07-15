-- Supabase's public-schema defaults grant browser roles table privileges.
-- RLS already exposes no rows, but encrypted signer material should also be
-- unreachable at the SQL privilege layer.
revoke all on public.agent_identities from public, anon, authenticated;
grant all on public.agent_identities to service_role;
