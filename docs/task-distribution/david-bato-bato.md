# David E. Bato-bato — The Backbone

**Mission:** connect the two halves of the app. Auth + profile already ship; the treasury is still a
single-browser persona simulation. Your workstream builds the bridge — **auth → real linked wallet →
multi-member pools** — so two real people on two devices can co-govern one treasury. Everyone else's
work plugs into the schema and RPCs you produce, so **freeze the interface contracts first** (M0).

> You already built auth, profile, custom email verification, and app-wide guards this sprint. This
> is the next layer up.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** nothing external — you
are the upstream. **Consumers:** Elton (directory/invite/roster UI), Shello (pools for feed scoping),
Earl (nonce endpoint, backend v1).

---

## Task list

### D0 — Freeze the schema + RPC contracts `S` · **do this first, M0**
Publish the exact column shapes and RPC signatures for `user_wallets`, `pools`, `pool_members`,
`pool_invites`, `invite_redemptions`, `preview_pool()`, `redeem_invite()`, and the wallet-nonce
endpoints — in [`README.md` §Interface contracts](./README.md#interface-contracts). Post a seed SQL
snippet Elton/Shello/Earl can load locally so they build against real rows on day 1.
**Acceptance:** contracts posted; Elton, Shello, Earl each thumbs-up before writing consumer code.

### D1 — Migration `0005_wallet_linking.sql` `M`
- `public.user_wallets (id, user_id → profiles cascade, address text, label text, is_primary bool,
  verified_at timestamptz, created_at)`; unique `(user_id, address)`; partial unique index enforcing
  one primary per user. RLS: owner-reads-own; **no client write of `verified_at`** (column grant lock
  like the `is_email_verified` pattern in `0004`) — only the service role sets it.
- `public.wallet_link_challenges (id, user_id, address, nonce text, expires_at, consumed_at)`; RLS on,
  no client policies (service-role only), TTL ~10 min.
**Acceptance:** applied in order; `get_advisors` clean except the expected `rls_enabled_no_policy` INFO;
`types.gen.ts` regenerated; a user cannot self-set `verified_at` from the client (42501).

### D2 — Wallet-link proof-of-ownership flow `L`
Backend endpoints live in Earl's backend-v1 but you own the **contract + the client UX**:
`POST /wallet/challenge {address} → {nonce}` (insert challenge) → client signs the nonce with the
Stellar key (`identity.ts` keypair today; Freighter/passkey later) → `POST /wallet/verify {address,
signature}` verifies with `stellar-sdk`, sets `user_wallets.verified_at`, consumes the challenge.
Build the **"Link a wallet"** screen (new route `routes/LinkWallet.tsx`, gated by `isSupabaseEnabled()`)
using `ui.tsx` primitives. Coordinate the two endpoints with Earl; stub them locally until his branch lands.
**Acceptance:** signing the nonce flips `verified_at`; a wrong/expired signature is rejected with the
generic-error pattern; only `verified_at` wallets are offered as pool signers downstream.

### D3 — Migration `0006_pools_membership.sql` `L`
The DB **mirror** of on-chain pools (zero authority — labels + membership + roster only):
- `public.pools (id, contract_id text unique, contract_version int default 1, wasm_hash text, name,
  currency default 'USDC', created_by → profiles, created_at)`.
- `public.pool_members (pool_id → pools cascade, user_id → profiles, address text, role text CHECK
  officer|member, joined_at, primary key (pool_id, user_id))`.
- `public.pool_invites (id, pool_id → pools cascade, code text unique, role text CHECK officer|member,
  expires_at, max_uses int, used_count int default 0, created_by, created_at)`.
- `public.invite_redemptions (invite_id → pool_invites, user_id → profiles, redeemed_at, primary key
  (invite_id, user_id))`.
- **RLS:** a pool + its members/feed are readable only by rows in `pool_members` for that pool.
  `pool_invites` is **never blanket-readable** (codes leak roles) — access only via the RPCs below.
**Acceptance:** applied; RLS allow/deny suite proves a non-member can't read a pool's roster; advisors clean.

### D4 — RPCs `preview_pool()` + `redeem_invite()` `M`
- `public.preview_pool(p_code text) returns <limited read-model>` — `SECURITY DEFINER`, `search_path=''`;
  lets an **anonymous** invitee see pool name / member count / their assigned role **before** signing up.
  Returns only the safe subset; never the code list or addresses.
- `public.redeem_invite(p_code text) returns pool_id` — `SECURITY DEFINER`; **atomic**: increments
  `used_count` with `where used_count < max_uses and now() < expires_at` returning, inserts the
  `invite_redemptions` row + the `pool_members` row for `auth.uid()`. Reject on any miss (expired,
  exhausted, already-redeemed).
- `revoke execute from public` where appropriate; `grant execute` to `anon` (preview) / `authenticated`
  (redeem) explicitly.
**Acceptance:** parallel double-redeem burns exactly one seat (test it); expired/exhausted invites
reject; preview reveals nothing sensitive; unknown code returns the same generic result.

### D5 — Wire the app: create/join real pools `L`
Add DB-backed, `isSupabaseEnabled()`-gated flow **alongside** the existing localStorage demo (do not
replace it):
- On pool creation (the existing `lib/livepool.ts` create path), after the contract deploys, also
  insert the `pools` row + the creator as an `officer` in `pool_members`.
- "Invite an officer/member" → create a `pool_invites` row → shareable link/QR (Elton builds the UI;
  you provide the create-invite call + the deep-link route `routes/JoinPool.tsx` that calls
  `preview_pool` then `redeem_invite`).
- A signed-in user's pools come from `pool_members` (Elton's directory), not from `localStorage`.
**Acceptance:** user A creates a pool → invites user B → B (different browser/account) previews, signs
up, redeems, and appears in A's roster; the no-env demo build is byte-for-byte the current demo.

### D6 — Membership ↔ officer-signer invariant `M`
Enforce that a `pool_members.role='officer'` maps to a `user_wallets.verified_at`-linked address, and
that address is what the contract's `require_auth` checks. Document the rule and add a guard so an
officer without a verified wallet is prompted to link one before they can approve.
**Acceptance:** an officer with no verified wallet is routed to D2's link flow; the on-chain officer
set and the DB roster never disagree for the demo pool.

---

## Start here (Day 1)
Do **D0** (freeze contracts) this morning so Elton/Shello/Earl unblock, then open the `0005` migration
(**D1**). By end of week 1 you want D1 applied + the D3/D4 shapes posted, even if the RPC bodies are
still stubs — that's what lets the team start their vertical slices at M1.

## Definition of done (your workstream)
- Migrations 0005 + 0006 applied, RLS + advisors clean, `types.gen.ts` regenerated.
- Wallet-link proof-of-ownership works end-to-end; only verified wallets sign.
- Two real accounts on two devices co-own one pool via invite → redeem → roster.
- Every new surface is additive and no-ops without Supabase env (demo untouched through Jul 15).
