# Shello — Activity Feed + Notifications (Jr Full-Stack)

**Mission:** make the app talk back. Build the **Realtime in-app activity feed** (reads Earl's
`chain_events` read-model — who contributed, who requested a spend, who approved, what was released)
and **Web Push notifications** so an officer learns "a spend needs your approval" without staring at
the app. Approvals are asynchronous — this is what makes the M-of-N flow usable when officers aren't
in the same room.

> You build against Jasmin's mockups (activity-feed + notification-settings) and Earl's `chain_events`
> contract. Both ship you a **stub** at M0 so you're never blocked: Earl seeds a few `chain_events`
> rows and Jasmin hands you the feed spec — start there and swap to live data when Earl's Realtime
> channel lands.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** Earl (`chain_events` +
Realtime channel, E1/E2/E5), Jasmin (feed + settings mockups, component kit), David (`pools` for
scoping). **Consumers:** end users.

---

## Task list

### S0 — Read the contracts + load the stub `S`
Read [`README.md` §Interface contracts](./README.md#interface-contracts) for the `chain_events` shape
and Earl's Realtime channel name. Load Earl's seed rows into your local DB. Skim
`contracts/treasury/src/lib.rs` to see what each event (`contrib`, `spend_req`, `approve`, `execute`)
actually carries, and `apps/web/src/lib/txlog.ts` for the existing local activity pattern you're
replacing/augmenting.
**Acceptance:** you can `select * from chain_events` locally and describe each event type's payload.

### S1 — Activity feed data hook `M`
New `apps/web/src/hooks/useActivityFeed.ts` — a TanStack Query hook that reads `chain_events` for the
active pool (scope by `pool_contract_id`), newest first, paginated. `isSupabaseEnabled()`-gated: when
env is absent, fall back to the existing local `txlog` so the demo is unaffected.
**Acceptance:** the hook returns typed events for a pool; no-env build still shows the demo's local log.

### S2 — Realtime live updates `M`
Subscribe to Earl's per-pool Realtime channel; new events prepend to the feed live (optimistic-safe:
de-dupe by `tx_hash`+`event_type`). Handle reconnect + backfill (re-query on resubscribe so nothing is
missed across a dropped socket).
**Acceptance:** a contribution/approval on another device appears in your feed within ~1s without a
manual refresh; a dropped-and-restored connection shows no gaps or dupes.

### S3 — Activity feed UI `M`
Build the feed screen from Jasmin's spec using `ui.tsx` primitives: one row per event with the actor,
a plain-language line ("Aling Nena contributed ₱200", "Kap. Ramon requested ₱1,200 for Equipment",
"2 of 3 approved — ₱1,200 released"), `peso()` amounts, relative time, and a tx-hash link to
`stellar.expert/explorer/testnet/tx/…`. Loading → `Skeleton`, empty → `EmptyState`. Add it as a new
route/tab (coordinate placement with Jasmin so it doesn't disturb the 4-tab demo nav).
**Acceptance:** matches the mock; every event type renders correctly with a working explorer link;
readable at phone width.

### S4 — Web Push: subscription + storage `M`
Migration `supabase/migrations/00NN_push_subscriptions.sql`: `push_subscriptions (id, user_id →
profiles, endpoint, p256dh, auth, created_at)` with owner-only RLS. Client: request notification
permission (from Jasmin's notification-settings screen), register the service worker push subscription
(the app is already a `vite-plugin-pwa` PWA), and persist it. Generate VAPID keys (server-only).
**Acceptance:** granting permission stores a valid subscription row; revoking removes it; settings
screen reflects state.

### S5 — Web Push: delivery `M`
Backend sender (in `services/ai`, coordinate with Earl's E5 trigger): on a `spend_req` → notify each
pool officer; on `execute` → notify contributors "funds released"; on `contrib` (optional) → notify
officers. Use `web-push` with the VAPID keys. Deep-link the notification to the relevant pool/spend.
Respect notification prefs from Jasmin's settings screen.
**Acceptance:** a real `spend_req` on a pool delivers a push to each officer's device that deep-links
to the pending spend; disabled prefs suppress it.

---

## Start here (Day 1)
Do **S0** + **S1** against Earl's seed rows and Jasmin's spec — you can build and style the entire feed
from static/seed data before Realtime is live, then flip to **S2** when Earl's channel lands. That
keeps you productive on day 1 with zero hard blocker.

## Junior guardrails (ask early, these bite)
- **Never write authority to the DB** — `chain_events` is a read-model; the feed only *displays* what
  the contract already did. If you find yourself computing a balance to *store*, stop and ask David.
- **Gate everything behind `isSupabaseEnabled()`** so the no-env demo build stays identical.
- **De-dupe by `(tx_hash, event_type)`** — Realtime can redeliver; the feed must be idempotent.
- Reuse `ui.tsx` + Jasmin's new primitives; no bespoke CSS. Externalize strings via Jasmin's `t()`.

## Definition of done (your workstream)
- Feed reads `chain_events`, updates live, matches the mock, links to on-chain proof, no-ops without env.
- Web Push subscribe + deliver works end-to-end for `spend_req`/`execute`, respecting prefs.
