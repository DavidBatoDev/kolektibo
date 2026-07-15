-- Activate the verified private-testnet product surfaces. Contract v2 and
-- passkey wallets remain off because those capabilities are not implemented.

insert into public.feature_flags (key, enabled, payload) values
  ('production_shell', true, '{"stage":"private_testnet_beta"}'::jsonb),
  ('multi_pool', true, '{"stage":"private_testnet_beta"}'::jsonb),
  ('pool_wizard_v1', true, '{"stage":"private_testnet_beta"}'::jsonb)
on conflict (key) do update
set enabled = excluded.enabled,
    payload = excluded.payload,
    updated_at = now();
