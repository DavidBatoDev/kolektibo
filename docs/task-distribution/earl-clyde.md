# Earl Clyde — Backend v1 + Indexer v0

**Mission:** you own the two most architecturally demanding pieces of Phase 1 — the ones that underpin
everyone else. First, **replace the Stellar-CLI shelling** in `services/ai` with real `stellar-sdk`
server code so the backend can run off one developer's laptop. Second, build **Indexer v0** — a
checkpointed event poller that turns on-chain events into the `chain_events` read-model that powers
every feed and notification (Shello builds on top of it).

> **Demo-freeze rule for you specifically:** the current `services/ai` CLI-shelling is what the Jul 15
> demo runs on (`/pool/create`, `/faucet`). Your rewrite lands on a **branch behind a flag** and is
> only cut over **after** Jul 15. Do not break the working `create`/`faucet`/`ask`/`rules` path on `main`.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** David's `pools` /
`user_wallets` shapes (D0/D1/D3) for the nonce + indexer scoping. **Consumers:** Shello (`chain_events`
+ Realtime), David (wallet `/challenge` + `/verify` endpoints).

## 🟢 Status — mostly done (2026-07-13, on `main`)

Most of your spine shipped in the build sprint (commit `faf527a`), so **review + extend, don't rebuild**:

- **E1 ✅ DONE** — `services/ai/src/indexer.ts` + `indexer-main.ts` (`pnpm indexer`). `chain_events` + `indexer_cursor` were already in `0001_init.sql`. Checkpointed `getEvents` poller, idempotent upsert on the 5-tuple, i128 stored as **strings**, `spend_req`/`execute` enriched via `contract.Client.from` `get_spend`. **Verified live:** contribute/request/approve/execute all landed in `chain_events` within a poll. (Fixes already folded in: backfill suppresses stale notification fan-out, narrowed cursor age-out regex.)
- **E4 ✅ DONE** — `services/ai/src/wallet.ts` (`/wallet/challenge` + `/wallet/verify`), with `supabaseAdmin.ts` + `ratelimit.ts`. Verified E2E. Rate limiter ignores spoofable `X-Forwarded-For` unless `TRUST_PROXY=1`.
- **E5 ✅ DONE** — `services/ai/src/notify.ts` fans out per event type (+ `push.ts` sender). `spend_req` skips fan-out when un-enriched.
- **E3 🟡 BUILT, UNWIRED** — `services/ai/src/chain.ts` has `deployPool` / `mintUsdc` / `ensureWasmHash` / `submitTx` (SDK equivalents of the CLI path), typechecked but **not cut over**. **Your remaining work:** wire the `USE_SDK_BACKEND=1` dispatch into `services/ai/src/index.ts` `/pool/create` + `/faucet` (keep the CLI branch as fallback), add faucet **rate limits** + CORS tightening, set `DEPLOYER_SECRET`/`ISSUER_SECRET` env, prove it with `smoke-write.mts`, then flip the default **after Jul 15**.
- **E2 ✅ DONE** — Supabase **Realtime** on `chain_events` via [`0008_chain_events_realtime.sql`](../../supabase/migrations/0008_chain_events_realtime.sql). RLS smoke test [`0008_chain_events_rls.sql`](../../supabase/tests/0008_chain_events_rls.sql). Interface contract + reference helper [`apps/web/src/lib/chainEventsRealtime.ts`](../../apps/web/src/lib/chainEventsRealtime.ts) (wired into `AppActivityPage` for live invalidation).

**Left for you: E3 cutover.** Everything else is done and E2E-verified. Detail below is retained for reference.

---

## Task list

### E0 — Read the current backend + agree the seam `S`
Read `services/ai/src/index.ts` (the CLI-shelling for `/pool/create`, `/faucet`) and
`apps/web/scripts/smoke.mts` / `smoke-write.mts` (they already do real `stellar-sdk` read/write —
your reference implementation). Confirm the endpoint contracts you must preserve byte-for-byte so the
frontend doesn't change. Sign off on David's wallet-nonce contract (D0).
**Acceptance:** a short note in your PR listing every endpoint's current request/response shape that
must stay stable.

### E1 — Indexer v0: `chain_events` table + checkpointed poller `L`
- Migration `supabase/migrations/0007_chain_events.sql`: `chain_events (id, pool_contract_id text,
  event_type text CHECK contrib|spend_req|approve|execute, ledger int, tx_hash text, payload jsonb,
  created_at)` + a checkpoint table `indexer_cursors (pool_contract_id, last_ledger)`. Append-only;
  unique `(tx_hash, event_type, ...)` to make ingestion idempotent. RLS: readable only by pool members
  (join through David's `pool_members`); writes via service role only.
- Poller (new `services/ai/src/indexer.ts`): `stellar-sdk` `getEvents` from the last checkpoint, per
  registered pool contract, on an interval; upsert into `chain_events`; advance the cursor. **RPC
  retains only ~24h of events** — checkpoint so you never miss a window. The treasury already emits
  `contrib`, `spend_req`, `approve`, `execute` (`contracts/treasury/src/lib.rs`
  `env.events().publish`).
**Acceptance:** contributing / requesting / approving / executing on a demo pool produces the four
event types in `chain_events` within one poll interval; restarting the poller resumes from the cursor
with zero dupes.

### E2 — Realtime channel per pool `M`
Expose the feed to the client: enable Supabase **Realtime** on `chain_events` (or a broadcast per
`pool_contract_id`) so Shello's feed updates live. Publish the exact channel name + payload shape in
the interface contracts. Ensure RLS gates Realtime the same as reads (non-members receive nothing).
**Acceptance:** Shello can subscribe to one pool's channel and receive a new event within ~1s of it
landing; a non-member subscription receives nothing.

### E3 — Backend v1: `stellar-sdk` server (behind a flag) `XL`
On a branch, reimplement the CLI-shelling endpoints with `stellar-sdk` (mirror `smoke-write.mts`):
- `/pool/create` — build/submit the deploy + init with the SDK instead of shelling `stellar contract`.
- `/faucet` — SDK-based friendbot/USDC funding with **rate limits** (today it mints to anyone — add a
  per-IP + per-address cap; plain-string 429 on abuse).
- Keep the OpenAI proxy (`/ask`, `/rules`, `/config`) unchanged.
- Config flag (`USE_SDK_BACKEND`) selects SDK vs. legacy CLI path so `main` stays on the proven path
  until after Jul 15.
- Secrets in env/KMS; service-role key server-only.
**Acceptance:** with the flag on, the full smoke-write loop (create → contribute → request → approve
→ execute) passes against the SDK backend with **no frontend change**; with the flag off, `main` is
untouched.

### E4 — Wallet nonce endpoints (with David) `M`
Implement `POST /wallet/challenge {address} → {nonce}` (insert into David's `wallet_link_challenges`)
and `POST /wallet/verify {address, signature}` — verify the signature over the nonce with `stellar-sdk`
`Keypair.verify`, set `user_wallets.verified_at` via the service role, consume the challenge. Generic
error on any failure; TTL-expire stale nonces.
**Acceptance:** David's Link-Wallet screen flips `verified_at` on a valid signature; replayed/expired
nonces are rejected.

### E5 — Notification fan-out hook `M`
When the indexer writes a `spend_req` or `execute` event, fan out to Shello's notification layer
(enqueue to `push_subscriptions` / a `notifications` row Shello owns, or emit the Realtime signal he
listens on). Keep the *delivery* (Web Push / VAPID) in Shello's workstream — you own the **trigger**.
**Acceptance:** a new `spend_req` reliably produces exactly one notification trigger per pool officer.

---

## Blockers & dependencies

### What I need from others

| My task | Needs | From | Until it lands |
|---|---|---|---|
| E1 member-read RLS on `chain_events` | `pool_members` table (D3) | David | Ship `chain_events` **service-role-only** first (poller doesn't need client reads); add the member-read policy in a follow-up migration when D3 lands |
| E4 wallet endpoints | `user_wallets` + `wallet_link_challenges` tables (D1) and the frozen endpoint contract (D0) | David | Blocked on D1 for real — build the signature-verify logic as a pure function with unit tests in the meantime |
| E5 notification trigger | `push_subscriptions` shape (S4) | Shello | Emit the trigger as a Realtime signal / `notifications` row first; wire to his table when S4 lands |
| — | Design tokens if you touch any UI (unlikely) | Jasmin | n/a — your work is headless |

### Who's waiting on me (don't let these slip)

| My task | Unblocks | Their task |
|---|---|---|
| **E1 `chain_events` + seed rows** | Shello | S0/S1 — **his entire workstream starts from your seed**; get 10 seeded rows into the DB by end of day 1 even if the poller is half-done |
| E2 Realtime channel | Shello | S2 live updates |
| E4 wallet endpoints | David | D2 wallet-link flow (he's stubbing until you land) |
| E5 trigger | Shello | S5 push delivery |

**If I'm the bottleneck:** E1's seed rows matter more than E1's poller — hand-insert realistic rows
for the canonical pool (`CBR36Q2…INF2`) so Shello starts, then make the poller real. E3 (backend v1)
has **zero downstream consumers** pre-cutover — it never justifies delaying E1/E2/E4.

## Start here (Day 1)
Do **E0** + open **E1** (the `chain_events` migration + a minimal poller against the canonical demo
pool `CBR36Q2…INF2`). Getting real events into a table is the single highest-leverage thing you can
ship — it unblocks Shello's entire workstream. Reuse `smoke.mts`'s SDK setup verbatim.

## Definition of done (your workstream)
- `chain_events` ingesting all four event types idempotently with a durable checkpoint; Realtime live.
- Backend-v1 SDK path passes the full write loop behind the flag, with rate-limited faucet; `main`'s
  demo path unchanged through Jul 15.
- Wallet nonce endpoints verified with David; notification triggers firing for Shello.
