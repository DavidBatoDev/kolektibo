-- Seed data for local dev. Safe to run repeatedly (idempotent).
insert into public.feature_flags (key, enabled, payload) values
  ('paluwagan_mode',   false, null),
  ('passkey_signing',  false, null),
  ('yield_blend',      false, null),
  ('anchor_moneygram', false, null),
  ('web_push',         false, null)
on conflict (key) do nothing;
