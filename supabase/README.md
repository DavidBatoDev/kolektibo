# Supabase — Kolektibo off-chain layer

Identity, directory, metadata, receipts, notifications, and chain read-models.
**Zero authority over money** — every money fact comes from the Soroban contracts on
Stellar. If this database is wiped, not one centavo is at risk.

See the [production roadmap](../docs/production-roadmap_2026-07-11_0552.md) for the full plan
and `migrations/0001_init.sql` for the schema + RLS.

## ⚠️ Migrations are approval-gated

Migration files are authored as code, but **no migration is applied to any database without
explicit per-migration approval.** The Supabase MCP is configured `--read-only`; all writes go
through the CLI (`supabase db push`) after sign-off.

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

# 3) Link to the remote project, then push migrations (AFTER approval)
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push               # applies pending migrations to the REMOTE db

# 4) Generate TypeScript types for the web app
supabase gen types typescript --linked > ../apps/web/src/db/types.gen.ts
```

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
                           readiness fields. Authored only; apply after review and approval.
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

## Testing (Phase 1)

Run the RLS allow/deny suite against `supabase start` before every schema change lands. The
intended matrix is documented as a comment block at the bottom of `0001_init.sql`. After any
change, run the Security + Performance advisors (`get_advisors`) and fix lints 0013 (RLS on all
public tables), 0003 (initplan / `(select auth.uid())`), 0011 (function `search_path`).
