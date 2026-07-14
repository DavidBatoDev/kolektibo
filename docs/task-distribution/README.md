# Kolektibo — Task Distribution (Phase 1: Identity & Persistence Foundation)

_Created: 2026-07-11 · Owner: David E. Bato-bato · Team of 5_

This folder splits the **Phase 1 — Identity & persistence foundation** work (from
[`docs/production-roadmap`](../production-roadmap_2026-07-11_0552.md), §Phase 1) into five
independent, mostly-parallel workstreams — one per teammate. The goal of Phase 1 in one line:

> **Kill the single-browser limitation.** Every user gets a real account, a real linked wallet,
> and pools + membership that follow them across devices — without ever giving the app authority
> over money.

## Who owns what

| Owner | Workstream (the one-line mission) | File |
|---|---|---|
| **David E. Bato-bato** | **The backbone** — auth → real wallet linking (proof-of-ownership) → multi-member pools (create / invite / join / roster) | [david-bato-bato.md](./david-bato-bato.md) |
| **Earl Clyde** | **Backend v1 + Indexer v0** — replace the Stellar-CLI shelling with `stellar-sdk` server code; build the `chain_events` read-model that powers every feed & notification | [earl-clyde.md](./earl-clyde.md) |
| **Jasmin Ivy** | **Design system, theme & polish** — own the theme, formalize design tokens & the component library, stand up i18n (en/tl), design every new screen, drive the money-UX polish pass | [jasmin-ivy.md](./jasmin-ivy.md) |
| **Shello** | **Activity feed + notifications** — the Realtime in-app feed (reads `chain_events`) and Web Push ("a spend needs your approval") | [shello.md](./shello.md) |
| **Elton James** | **Directory, invites & roster UI** — the screens for David's pools/membership backend: pool directory, invite/join, member roster, address book, DPA account deletion | [elton-james.md](./elton-james.md) |

## Implementation status — updated 2026-07-13 (committed to `main`, pushed)

A build sprint landed the load-bearing spine of this whole phase ahead of the team — commits
`e29684f` (db), `faf527a` (api), `ceeb58d` (web), `4b33ba1` (test). It was **validated end-to-end**
by a two-user Playwright run (two accounts, two device keys: link wallet → draft pool → officer
invite → join → deploy on-chain → contribute → request → **cross-device approve** → release), and the
indexer captured all four event types. **Gate note:** the entire new surface is behind the
`multi_pool` feature flag, currently **off** (demo freeze intact) — flip it on to exercise it.

| Owner | Status | Left to do |
|---|---|---|
| **David** | ✅ **Complete** (D0–D6, E2E-verified) | — |
| **Earl** | 🟢 Mostly done — indexer (E1), wallet endpoints (E4), fan-out (E5), **Realtime (E2)** shipped; `chain.ts` SDK backend built but unwired | **E3 cutover** (wire `USE_SDK_BACKEND` + faucet rate limits, post-Jul-15) |
| **Elton** | 🟢 Mostly done — directory (EL1), invite (EL2), join (EL3), roster (EL4) shipped | **EL5** address book (payees), **EL6** DPA account deletion, invite **QR** |
| **Shello** | 🟡 Backend done (`push.ts` sender + `notify.ts` triggers) | **S1–S3** activity-feed UI (reads `chain_events`), **S4–S5** client push subscribe + VAPID delivery (needs PWA SW switch) |
| **Jasmin** | 🔲 Open — functional screens shipped on the *existing* tokens/`ui.tsx` | **All of J0–J4**; first concrete job: reskin + **i18n** the new screens (their strings are hardcoded English) |

> **What actually got built vs. the original plan below.** Schema-v1 (`supabase/migrations/0001_init.sql`)
> already contained most tables (`pools`, `pool_members`, `pool_invites`, `user_wallets`, `payees`,
> `chain_events`, `indexer_cursor`, `push_subscriptions`, `notifications`). The one new migration is
> **`0005_multiuser_wiring.sql`** (draft-pool flow, `wallet_link_challenges`, `verified_at` column-lock,
> RPCs `create_pool_draft` / `set_my_pool_address` / `activate_pool`, extended `preview_pool` /
> `redeem_invite`) — **not** the separate `0005_wallet_linking` + `0006_pools_membership` +
> `0007_chain_events` the per-task docs below still describe. The original task text is kept for context;
> the **✅ / 🟡 / 🔲 markers in each teammate file are the source of truth** for what remains.

## Two laws every task obeys

1. **Architecture law — money authority lives *only* in the Soroban contract.** Supabase holds
   identity, directory, metadata, read-models, and notifications with **zero authority over funds**.
   If the DB is wiped, not one centavo is at risk. Never move money logic into the database. Every
   table we add is keyed by on-chain `Address` / contract id and holds only labels, membership, and
   mirrored read-only state. (See [`CLAUDE.md`](../../CLAUDE.md), `ARCHITECTURE.md`.)

2. **Demo freeze through the Jul 15 submission — all Phase-1 work is _additive_.** The working
   treasury demo must stay green. **Do not** edit `contracts/treasury/src`, re-run `scripts/deploy.sh`,
   rewrite the `services/ai` CLI-shelling *in a way that breaks the current demo*, or rewire the
   `localStorage` identity/pool/persona backbone (`lib/identity.ts`, `lib/pool.ts`, `lib/wallet.ts`,
   `lib/livepool.ts`). New screens & tables are **new files** that **no-op when their env is absent**
   — gate every DB-backed UI behind `isSupabaseEnabled()` (`apps/web/src/lib/supabase.ts`) so a
   no-env build is still the exact working demo. Earl's backend-v1 rewrite lands on a branch behind a
   flag and is only cut over **after** Jul 15.

## Dependency graph (who unblocks whom)

```
                 ┌─────────────────────────────────────────────┐
   DAVID         │ migrations 0005+: user_wallets, pools,       │
   the backbone  │ pool_members, pool_invites, invite_redempt.  │
                 │ RPCs: preview_pool(), redeem_invite()        │
                 │ wallet nonce challenge  ────────────────────┐│
                 └───────────┬──────────────────────┬──────────┘│
                             │ schema + RPCs         │ schema    │ nonce ep
                             ▼                        ▼           ▼
                   ELTON (directory/invite/    (David also     EARL (backend v1
                   roster/address-book/DPA)     builds the      serves /wallet/*)
                                                wallet-link UI)
   EARL           ┌─────────────────────────────────────────────┐
   read-model     │ chain_events table + getEvents poller +      │
                  │ Realtime channel + backend-v1 endpoints      │
                  └───────────┬─────────────────────────────────┘
                              │ chain_events + Realtime
                              ▼
                    SHELLO (activity feed + Web Push)

   JASMIN  ── design tokens + component specs + screen mockups + i18n scaffold ──▶ everyone
            (frontstops Shello & Elton; David & Earl consume tokens/components)
```

**Nobody is hard-blocked on day 1.** Each person has a self-contained "Start here" task, and every
cross-team dependency ships with a **contract + a stub/seed** (see [Interface contracts](#interface-contracts))
so everyone can build against a mock and swap to the real thing later.

## Milestones (2–3 week Phase-1 sprint; estimates degrade gracefully if solo/part-time)

| Milestone | Target | What "done" looks like |
|---|---|---|
| **M0 — Foundations set** | end of week 1 | Design tokens + i18n scaffold merged (Jasmin); migrations 0005+ applied with RLS + seed data (David); `chain_events` table + poller skeleton running (Earl). Interface contracts frozen. |
| **M1 — Vertical slices** | mid week 2 | Wallet-link flow works end-to-end (David); directory + invite/join against real RPCs (Elton); activity feed renders from real `chain_events` (Shello); backend-v1 `/wallet/*` + `/pool/create` on the branch (Earl); every new screen matches the design kit (Jasmin). |
| **M2 — Multi-device demo** | end week 3 | Two real people on two devices co-govern one pool: sign up → link wallets → one creates a pool → invites the other → both appear in the roster → contribution & approval show in both feeds → push fires. Guards + RLS test suite green. Demo (no-env) still identical. |

## Shared conventions (read once, follow everywhere)

- **Migrations-as-code (pre-approved for MVP).** Author every schema change as
  `supabase/migrations/NNNN_name.sql`, apply in order via the Management API / CLI, and state what
  each does. Next free number is **0005**. Turn RLS **on** for every new table with explicit
  allow/deny policies; add a `get_advisors` check to your PR. (See [`CLAUDE.md`](../../CLAUDE.md).)
- **RLS everywhere.** No table ships without policies. Read-models are readable only by pool members;
  writes to authority-mirroring tables go through `SECURITY DEFINER` RPCs or the service role, never
  raw client writes.
- **Backend style (`services/ai`).** ESM + `tsx`, `zod` validation, `res.json({...})` on success,
  **plain-string** bodies on 4xx/5xx, `console.error('[/route]')`. Service-role key is **server-only**
  — never in the client bundle.
- **Frontend style.** React 19 + Vite + TanStack Router (code-based, `apps/web/src/router.tsx`) +
  TanStack Query. Reuse the primitives in `apps/web/src/components/ui.tsx` (`Card`, `Button`, `Field`,
  `inputClass`, `Badge`, `peso()`), never hand-roll. Keep the `kolektibo.*` localStorage demo state
  strictly separate from the Supabase `sb-*` session.
- **No-op without env.** Anything Supabase-backed must return/​render nothing when `!isSupabaseEnabled()`.
  Guards already do this (`lib/authGuard.ts`). Follow that pattern.
- **Branch + PR per task.** `feat/<area>-<short>` off `main`; open a PR; no direct pushes to `main`.
  Keep PRs small and reviewable. Don't commit secrets — `.env*` is gitignored.

## Interface contracts (freeze these at M0 so the pieces fit)

These are the seams between workstreams. Owners publish the exact shape at M0; consumers build
against the stub until then.

- **`user_wallets`** (David → Elton/Earl): `user_id, address, verified_at, is_primary, label`. Only
  `verified_at IS NOT NULL` addresses may be pool signers.
- **`pools` / `pool_members`** (David → Elton/Shello/Earl): `pools(id, contract_id, contract_version,
  name, currency, created_by)`; `pool_members(pool_id, user_id, address, role ∈ {officer,member},
  joined_at)`. DB mirror of on-chain truth — **read-model only, zero authority**.
- **`preview_pool(invite_code)` / `redeem_invite(invite_code)`** (David → Elton): `SECURITY DEFINER`
  RPCs. Invites are **never** blanket-readable (codes leak roles); preview & redemption go through the
  RPC only; redemption is atomic against `used_count` / `invite_redemptions`.
- **`chain_events`** (Earl → Shello): `id, contract_id, event_type ∈ {contrib,spend_req,approve,
  execute}, ledger, tx_hash, tx_index, op_index, event_index, payload jsonb, occurred_at`.
  Append-only read-model; de-dupe key `(contract_id, ledger, tx_index, op_index, event_index)`.
  **Realtime (E2):** channel `pool-events:{contract_id}`; subscribe to `postgres_changes`
  `INSERT` on `public.chain_events` with filter `contract_id=eq.{contract_id}`; `payload.new`
  is a full row. Payload shapes: `contrib` → `{from, amount}`; `spend_req` → spend fields;
  `approve` → `{spend_id, officer}`; `execute` → `{spend_id, amount, recipient, category, memo}`
  (amounts as strings). On reconnect (`SUBSCRIBED`), re-run the initial SELECT to backfill.
- **Wallet nonce** (David UI ↔ Earl backend): `POST /wallet/challenge {address} → {nonce}`;
  client signs the nonce with the Stellar key; `POST /wallet/verify {address, signature}` → sets
  `user_wallets.verified_at`.
- **Design tokens + components** (Jasmin → all): the canonical token set in `apps/web/src/index.css`
  `@theme` and the component API in `components/ui.tsx`. Any new shared primitive lands there first.

---

Each teammate's file has their full task list with acceptance criteria, the exact repo files to
touch, effort estimates (`S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d), a **Blockers & dependencies**
section (what you need from whom, the workaround until it lands, and who's waiting on you), and a
"Start here" first task. If a stub costs you more than ~an hour to fake, raise it the same day —
David re-sequences. Ping David on any interface question — the seams matter more than the internals.
