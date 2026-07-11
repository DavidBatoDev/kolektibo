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

## Start here (Day 1)
Do **E0** + open **E1** (the `chain_events` migration + a minimal poller against the canonical demo
pool `CBR36Q2…INF2`). Getting real events into a table is the single highest-leverage thing you can
ship — it unblocks Shello's entire workstream. Reuse `smoke.mts`'s SDK setup verbatim.

## Definition of done (your workstream)
- `chain_events` ingesting all four event types idempotently with a durable checkpoint; Realtime live.
- Backend-v1 SDK path passes the full write loop behind the flag, with rate-limited faucet; `main`'s
  demo path unchanged through Jul 15.
- Wallet nonce endpoints verified with David; notification triggers firing for Shello.
