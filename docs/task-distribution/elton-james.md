# Elton James — Directory, Invites & Roster UI

**Mission:** build the human-facing surface of the multi-user pools that David's schema makes possible.
Today a user's "pool" is a single contract id in `localStorage` — clear the browser and it's gone.
You build the **pool directory** (pools that follow the user across devices), the **invite → join**
flow (share a link/QR, an invitee previews and joins), the **member roster**, a **named-payee address
book**, and the **DPA-compliant account-deletion** flow.

> You build against Jasmin's mockups and David's schema + RPCs. David ships you a **seed** at M0 (real
> `pools` / `pool_members` / `pool_invites` rows + the `preview_pool` / `redeem_invite` signatures) so
> you can build the whole directory against real data on day 1, even before his RPC bodies are final.

**Effort legend:** `S` ≤2h · `M` ½–1d · `L` 1–2d · `XL` >2d. **Depends on:** David (`pools`,
`pool_members`, `pool_invites`, `preview_pool()`, `redeem_invite()` — his D3/D4/D5), Jasmin
(directory/invite/roster/address-book mockups + component kit). **Consumers:** end users.

## 🟢 Status — mostly done (2026-07-13, on `main`)

Four of your six screens shipped in the build sprint (commit `ceeb58d`), so **review + restyle to
Jasmin's spec, don't rebuild**:

- **EL1 ✅ DONE** — `apps/web/src/routes/Pools.tsx` + `hooks/usePools.ts` + `lib/poolsApi.ts` (`listMyPools`). My-pools directory, role badges, create/join CTAs; `multi_pool`-flag-gated.
- **EL2 ✅ DONE (minus QR)** — `apps/web/src/routes/PoolInvite.tsx`: officer creates an invite (role + expiry), copy-link. **Left:** the **QR** render (needs Jasmin's `QRCode` primitive).
- **EL3 ✅ DONE** — `apps/web/src/routes/Join.tsx`: `preview_pool` → sign-in/up → `redeem_invite`, all error states + a "Not now" escape. Verified E2E (a second account joined as officer).
- **EL4 ✅ DONE** — roster in `apps/web/src/routes/PoolDetail.tsx`: officers/members, avatars, **verified-wallet badges**, contribution totals. (Note: the `getRoster` embed had to be disambiguated to `profiles!pool_members_user_id_fkey` — `pool_members` has two FKs to `profiles`; already fixed.)
- **EL5 🔲 TODO** — **address book (named payees).** The `payees` table already exists (`0001_init.sql`, member-read/officer-write RLS) but is **unused** — `PoolSpend.tsx` still takes a raw `G…` address. Build `hooks/usePayees.ts` + a `PayeePicker` and wire it into the spend flow so a recipient shows a name.
- **EL6 🔲 TODO** — **DPA account deletion.** Not started. Block deletion while the user is an active officer; tombstone attribution; remove PII. Entry point in Profile/Settings.

**Left for you: EL5 (address book), EL6 (account deletion), and the invite QR.** Detail below is retained for reference.

---

## Task list

### EL0 — Read the contracts + load the seed `S`
Read [`README.md` §Interface contracts](./README.md#interface-contracts) for David's table shapes and
RPC signatures. Load his seed rows locally. Read `apps/web/src/lib/pool.ts` + `hooks/usePool.ts` to
see the current single-pool localStorage model you're extending (not replacing — it stays for the
no-env demo).
**Acceptance:** you can list seeded pools + members locally and call the (stubbed) `preview_pool` /
`redeem_invite` RPCs.

### EL1 — Pool directory `M`
New `apps/web/src/hooks/usePools.ts` + a **My Pools** screen: list every pool the signed-in user
belongs to (from `pool_members` joined to `pools`), each row showing name, currency, role
(officer/member), member count. "Create a pool" CTA routes into David's create flow; "Join a pool"
routes to the code/link entry. `isSupabaseEnabled()`-gated — when env is absent, the app keeps its
current single-localStorage-pool behavior untouched.
**Acceptance:** a user with two memberships sees both pools; selecting one sets it active for the rest
of the app; no-env demo unchanged.

### EL2 — Invite flow (create + share) `M`
From a pool's roster, an officer creates an invite (role = officer/member, expiry, max uses) via
David's create-invite call → render a **shareable link + QR + copy button** (use Jasmin's `QRCode` /
`CopyField` primitives). The link deep-links to the Join route (EL3).
**Acceptance:** an officer generates an invite link + QR; copying/opening it lands on the join preview;
a member (non-officer) cannot create invites (RLS + UI both enforce).

### EL3 — Join flow (preview + redeem) `M`
New `routes/JoinPool.tsx` reachable from the invite link. Flow: call `preview_pool(code)` → show the
invitee what they're joining (pool name, member count, their assigned role) **before** they commit →
if signed out, route through sign-up/sign-in (guards already exist), then call `redeem_invite(code)` →
on success land in the pool. Handle every failure from David's RPC (expired / exhausted /
already-a-member / bad code) with a clear message.
**Acceptance:** a brand-new user opens an invite link → previews → signs up → redeems → appears in the
roster; an expired/exhausted/reused link shows the right error and never adds a phantom member.

### EL4 — Member roster `M`
On a pool, show the roster from `pool_members`: officers vs members grouped, each with display name +
avatar (from `profiles`), a **verified-wallet badge** (from David's `user_wallets.verified_at`), and
contribution total where available. Officers see invite + (later) manage controls; members see
read-only.
**Acceptance:** roster matches the DB; officer/member permissions differ correctly; an officer without
a verified wallet is visibly flagged (ties into David's D6).

### EL5 — Address book (named payees) `M`
Replace per-browser payee memory with a real, cross-device address book. Migration
`supabase/migrations/00NN_payees.sql`: `payees (id, owner_user_id → profiles, or pool_id, address,
name, created_at)` with owner/member RLS. UI: add/edit/pick a named payee in the Spend flow
(`routes/Spend.tsx`) so a spend recipient shows "MVP Sports Depot", not a raw `G…` address.
**Acceptance:** a saved payee appears by name across devices; picking one prefills the recipient
address; no-env demo keeps its current local behavior.

### EL6 — Account deletion (DPA) `M`
Data-Privacy-Act-compliant deletion (roadmap P1.4): a user may delete their account **only** when they
are **not** an active officer of any pool (block with a clear "rotate out first" message). On delete:
tombstone their attribution so audit/roster history survives (`ON DELETE` policy + actor tombstone),
revoke sessions, remove PII. Add the entry point in Profile/Settings.
**Acceptance:** an active officer is blocked with guidance; a non-officer deletes cleanly; roster/audit
references don't dangle; the user's PII is gone.

---

## Blockers & dependencies

### What I need from others

| My task | Needs | From | Until it lands |
|---|---|---|---|
| EL0/EL1 directory | `pools`/`pool_members` tables + seed rows (D0/D3) | David | **Day-1 need — chase him for the seed.** The table shapes are already frozen in the [README contracts](./README.md#interface-contracts); you can write `usePools.ts` against them before the seed exists |
| EL1 directory UI | Directory mock (J3) + component kit (J1) | Jasmin | Build with existing `Card`/`Badge`/`ListItem`; restyle to the mock when it arrives |
| EL2 invite share | Create-invite call (D5) + `QRCode`/`CopyField` primitives (J1) | David, Jasmin | Render the raw invite link with a copy button; add QR when the primitive lands |
| EL3 join flow | `preview_pool()` + `redeem_invite()` RPCs (D4) | David | Build the screen states (preview / errors / success) against a stubbed response object; swap to the RPC when callable |
| EL4 verified badge | `user_wallets.verified_at` (D1/D2) | David | Render the badge from seed data; it goes live when wallet-linking ships |
| EL5 address book | Address-book mock (J3) | Jasmin | Migration + hook first (UI-independent); skin the picker later |
| EL6 DPA deletion | Officer check needs `pool_members` (D3) | David | Blocked on D3 for the guard only — the deletion/tombstone plumbing can be built first |

### Who's waiting on me

| My task | Unblocks | Their task |
|---|---|---|
| EL1 active-pool selection | Shello | His feed scopes to the pool your directory marks active — agree the "active pool" state shape with him early (a shared hook or context) |
| EL5 `payees` shape | David | D5's spend flow shows named payees; publish the migration shape when drafted |

**Escalation rule:** if a dependency stub costs you more than ~an hour to fake, say so in the team
channel the same day — David re-sequences; don't sit blocked.

## Start here (Day 1)
Do **EL0** + **EL1** against David's seed rows and Jasmin's directory mock — the directory is fully
buildable from seeded `pools`/`pool_members` before any RPC body is final. Then **EL3** (join) once
David's `preview_pool`/`redeem_invite` are callable at M1.

## Guardrails (ask early, these bite)
- **The DB is a directory, never authority.** Your tables hold names, membership, and labels keyed by
  on-chain address/contract id. Never store or compute a balance as truth — the contract owns money.
  If unsure, ask David.
- **Invites go through the RPCs only.** Never `select * from pool_invites` from the client (codes leak
  roles). Use `preview_pool` / `redeem_invite`; redemption must be atomic (David's RPC handles it —
  don't re-implement it client-side).
- **Gate everything behind `isSupabaseEnabled()`**; the no-env demo build must stay byte-for-byte the
  current demo through Jul 15.
- Reuse `ui.tsx` + Jasmin's primitives; externalize strings via Jasmin's `t()`. Branch + PR per task.

## Definition of done (your workstream)
- Directory, invite create/share, join preview+redeem, roster, address book, and DPA deletion all work
  end-to-end against David's schema/RPCs, match Jasmin's mocks, and no-op without Supabase env.
