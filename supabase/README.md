# Supabase — Kolektibo off-chain layer

Identity, directory, metadata, receipts, notifications, and chain read-models.
**Zero authority over money** — every money fact comes from the Soroban contracts on
Stellar. If this database is wiped, not one centavo is at risk.

See the [production roadmap](../docs/production-roadmap_2026-07-11_0552.md) for the full plan
and `migrations/0001_init.sql` for the schema + RLS.

## Migration workflow

MVP migrations are pre-authorized by the repository instructions. Author every change as an
additive migration, review its RLS and money-authority boundary, apply it through the linked CLI or
Management API, then regenerate the web types. Never place pooled-money authority in Postgres.

## Environment variables (never commit these)

`.mcp.json` and `config.toml` reference these — set them in your shell/CI, not in files:

| Var | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens (personal token, `sbp_…`) |
| `SUPABASE_PROJECT_REF` | Supabase dashboard → Project Settings → General → Reference ID |
| `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` | Google Cloud Console → OAuth client (for `auth.external.google`) |

> A previous inline token in `.mcp.json` was rotated — always keep secrets in the environment.

## First-time setup (when a real project exists)

```bash
# 1) Install the CLI (once)
#    Windows:  scoop install supabase   |   npm i -g supabase   |   see supabase.com/docs/guides/cli
supabase --version

# 2) Local stack (needs Docker) — for development + RLS testing
supabase start                 # boots Postgres/Auth/Storage locally
supabase db reset              # applies migrations/ + seed.sql to the LOCAL db

# 3) Link to the remote project, then push reviewed migrations
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push               # applies pending migrations to the REMOTE db

# 4) Generate TypeScript types for the web app
supabase gen types typescript --linked > ../apps/web/src/db/types.gen.ts
```

## Supabase-only Web Push

Web Push uses the existing `notifications` and `push_subscriptions` tables. A
Database Webhook calls the `push` Edge Function for every notification insert;
the AI/indexer service never holds VAPID keys or sends pushes.

```bash
# Reuses the previous local VAPID pair when present; otherwise creates one.
# The generated file is ignored and private values are never printed.
pnpm push:setup
supabase secrets set --env-file supabase/.env.push.local
supabase functions deploy push --use-api
```

The `supabase_push_notifications` migration creates the `notifications` insert
webhook using `pg_net`. Its
function URL and dedicated webhook secret live in Supabase Vault; the private
value is also installed as the Edge Function's `PUSH_WEBHOOK_SECRET`. No service
role key is stored in trigger metadata. Users then enable notifications once in
Kolektibo. On iPhone/iPad, install Kolektibo to the Home Screen before enabling
push.

After a local reset, run the production-foundation authorization smoke test:

```powershell
Get-Content supabase/tests/0006_production_foundation_rls.sql |
  docker exec -i supabase_db_kolektibo psql -v ON_ERROR_STOP=1 -U postgres -d postgres
supabase db lint --level warning
```

## Layout

```
migrations/0001_init.sql   schema v1: profiles, wallets, pools, members, invites, payees,
                           chain_events (indexer read-model), spend/contribution meta,
                           paluwagan cycles, ai_usage, notifications, audit_log, feature_flags;
                           SECURITY DEFINER membership helpers; RLS on every table;
                           preview_pool / redeem_invite RPCs; RLS test matrix (bottom comment)
migrations/0005_multiuser_wiring.sql
                           draft pools, wallet ownership challenges, invite return flow,
                           and deployment lifecycle RPCs
migrations/0006_production_foundation.sql
                           production profile/consent fields, normalized pool policies,
                           operational roles/signers, goals, attachments, and smart-wallet
                           readiness fields. Applied to the hosted testnet project.
migrations/20260715084008_supabase_push_notifications.sql
                           Vault-backed notification webhook to the Supabase push Edge Function
migrations/20260715101500_pool_governance_policy_rpc.sql
                           atomic, officer-only draft governance policy replacement
migrations/20260715104500_activate_testnet_product_flags.sql
                           enables the hosted production shell, multi-pool UI, and pool wizard
migrations/20260715120000_harden_pool_governance_policy_rpc.sql
                           bounds and validates atomic draft governance policy replacement
migrations/20260715140000_autonomous_treasury_agent.sql
                           v1/v2 contract history, private per-pool agent identities, governed
                           mandates, durable runs/tool steps/executions, claim-once scheduling,
                           member-scoped RLS, and Realtime publication
migrations/20260715150000_harden_agent_identity_grants.sql
                           removes browser SQL privileges from encrypted agent identities
seed.sql                   feature flags for local dev
config.toml                auth providers (email magic-link · Google · anonymous), ports
```

## RLS model (why it's safe)

- Every public table has RLS enabled. Cross-table membership checks use
  `is_pool_member()` / `is_pool_officer()` — `SECURITY DEFINER STABLE` with `search_path=''`
  (avoids recursive-policy errors), and policies always use `(select auth.uid())` (per-query,
  not per-row).
- Anonymous/pre-member access is granted **only** through `preview_pool()` and `redeem_invite()`
  RPCs — never a blanket policy (invite codes must not leak).
- `chain_events`, `indexer_cursor`, `audit_log`, and payout writes have **no** authenticated
  policy → only the backend/indexer (service role) can write them.
- The **service-role key is server-only** — never shipped to the browser/PWA (it bypasses RLS).
- `agent_identities` has no member/browser policy or grant. Only the service role can read the
  encrypted per-pool signing material. Members see run, tool, and mandate audit records through
  pool membership RLS; the browser cannot claim execution jobs.

## Testing (Phase 1)

Run the RLS allow/deny suite against `supabase start` before every schema change lands. The
intended matrix is documented as a comment block at the bottom of `0001_init.sql`. After any
change, run the Security + Performance advisors (`get_advisors`) and fix lints 0013 (RLS on all
public tables), 0003 (initplan / `(select auth.uid())`), 0011 (function `search_path`).

The autonomous-agent migration has an additional allow/deny and claim-once suite:

```powershell
Get-Content supabase/tests/20260715140000_autonomous_treasury_agent.sql |
  docker exec -i supabase_db_kolektibo psql -v ON_ERROR_STOP=1 -U postgres -d postgres
```

After applying that migration remotely, regenerate `apps/web/src/db/types.gen.ts`. The Agent UI
uses Supabase Realtime only to invalidate durable database records; autonomous execution is always
authorized again by the v2 Soroban mandate.
