# Kolektibo — Claude project instructions

## Database migrations — MVP: pre-approved
This is an MVP. The user has **pre-approved all database migrations** (stated 2026-07-11:
"I approved every migration … because this is just MVP"). Apply Supabase/Postgres migrations
**without pausing for per-migration approval** — but always author them as
`supabase/migrations/NNNN_name.sql`, apply them in order, and **state what each migration does**
when applying. Re-introduce the approval gate before production / any non-MVP project.

## Architecture law
Money authority lives **only** in the Soroban contracts on Stellar. Supabase holds identity,
directory, metadata, and read-models with **zero authority over funds** — if the DB is wiped, not
one centavo is at risk. Never move money logic into the database.

## Supabase (project: APAC / `protxmboekwtzxpwmplt`)
- URL `https://protxmboekwtzxpwmplt.supabase.co`; org `zrnxiahujolulqizbigg`.
- Access token: `SP_ACCESS_TOKEN` in `services/ai/.env` (gitignored). Web keys:
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `apps/web/.env.local` (gitignored).
- The `.mcp.json` Supabase MCP is `--read-only` and bound to `${SUPABASE_PROJECT_REF}` (often
  unset), so schema writes go via the **Management API** (`POST /v1/projects/<ref>/database/query`,
  Bearer `SP_ACCESS_TOKEN`) or the Supabase CLI — not the MCP.
- Generated types: `apps/web/src/db/types.gen.ts`. Migration history:
  `supabase_migrations.schema_migrations`.

## Demo freeze — through the Jul 15 submission
Keep the working treasury demo intact. Do **not**: edit `contracts/treasury/src` or re-run
`scripts/deploy.sh` (mints new contract IDs + rewrites `apps/web/.env.local`), rewrite the backend
CLI-shelling in `services/ai`, or rewire the localStorage identity/pool/payee backbone. New Phase-1
work must be **additive** (new files/screens, no-op when its env is absent).
