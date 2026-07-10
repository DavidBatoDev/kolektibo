# Roadmap & Next Steps
_Created: 2026-07-11 01:46 MPST · Kolektibo · Stellar Testnet_

The core product is **done and proven on-chain.** The Soroban treasury (`contracts/treasury/src/lib.rs`) is deployed to Stellar Testnet, passes 4/4 Rust tests, and has demonstrated the full multisig USDC release — with single-officer release, duplicate approval, non-officer proposal, and over-limit spend all reverting on-chain. Both smoke tests (`apps/web/scripts/smoke.mts` read path, `smoke-write.mts` write path) pass end-to-end, and the create-your-own-pool onboarding deploys a fresh treasury per group from the browser. What remains before the **Jul 15, 2026** final submission deadline is **presentation and polish, not core function** — plus a set of explicitly-judged composability stretches and a longer production-hardening path for after the hackathon.

This document is the prioritized backlog. It is organized into three horizons — **Near-term (must ship before Jul 15)**, **Stretch / composability (judged, ship if the loop is rock-solid)**, and **Hardening (post-hackathon production path)** — each item carrying an effort estimate, an impact rating tied to the judging criteria, and concrete, repo-grounded implementation notes.

---

## Legend

| Field | Scale |
|---|---|
| **Priority** | `P0` blocks submission · `P1` strongly want for submission · `P2` stretch (judged bonus) · `P3` post-hackathon |
| **Effort** | `S` ≤ 2h · `M` ½–1 day · `L` 1–2 days · `XL` > 2 days |
| **Impact** | ⭑⭑⭑ high · ⭑⭑ medium · ⭑ low — weighted by the hackathon steer (real utility · local anchors/assets · composability) |

Estimates assume the current small team and the verified baseline below; they are planning estimates, not commitments.

---

## Where we stand (the baseline this roadmap builds on)

Everything in the winning demo loop is real and verified. Nothing below asks us to rebuild it.

| Layer | State | Evidence |
|---|---|---|
| Treasury contract | **Complete** — 10 functions, 10 error codes, 4 events | `contracts/treasury/src/lib.rs`; `cargo test` 4/4 |
| Testnet deployment | **Live** — canonical `CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2` | `DEPLOYMENT.md`, `scripts/deploy.sh` |
| Multisig proof | **On-chain** — real USDC release after 2-of-3 | tx `127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278` |
| Read path | **Verified** — bindings read live state | `apps/web/scripts/smoke.mts` (20,000 USDC, threshold 2) |
| Write path | **Verified** — create→contribute→request→approve→execute | `apps/web/scripts/smoke-write.mts` (300 USDC moved E2E) |
| AI backend | **Running** — `/rules`, `/ask`, `/config`, `/faucet`, `/pool/create` | `services/ai/src/index.ts` |
| Web client | **Running** — Home / Contribute / Spend / Setup + create-pool onboarding | `apps/web/src` |

**The gap is not the machine — it is the story, the finish, and the package around it.**

---

## Timeline at a glance

```
        Jul 11        Jul 12        Jul 13        Jul 14        Jul 15        Jul 18       Jul 24
        (today)                                                DEADLINE      Demo Day     Grand Finale
  ┌───────────┬─────────────┬─────────────┬─────────────┬─────────────┬────────────┬──────────────┐
  │ Browser   │ UI/UX       │ Final       │ Submission  │  SUBMIT     │  Live      │  Grand       │
  │ QA sweep  │ polish pass │ polish +    │ package     │  (morning,  │  demo      │  Finale      │
  │ lock demo │ demo-script │ record demo │ assembly +  │  w/ buffer) │  (loop +   │              │
  │ state     │ draft +     │ video       │ buffer +    │             │  moat)     │              │
  │ deck      │ rough cut   │ build deck  │ stretch if  │             │            │              │
  │ outline   │             │             │ loop solid  │             │            │              │
  └───────────┴─────────────┴─────────────┴─────────────┴─────────────┴────────────┴──────────────┘
   ◄──────────────── P0 must-ship ────────────────────►│◄ P2 stretch only if P0 is rock-solid ►
```

Two deliverables have hard external deadlines: the **written + video submission (Jul 15)** and the **live Demo Day (Jul 18)**. Everything on the P0 list feeds both.

---

## 1. Near-term — must ship before Jul 15 (P0/P1)

Ranked by "would its absence hurt the submission most."

| # | Item | Priority | Effort | Impact | Blocks |
|---|---|---|---|---|---|
| 1.1 | Browser QA sweep + demo-state lock | P0 | M | ⭑⭑⭑ | Everything (a broken loop kills the demo) |
| 1.2 | Demo script + demo video | P0 | M–L | ⭑⭑⭑ | Video is typically a submission requirement |
| 1.3 | Pitch deck | P0 | M | ⭑⭑⭑ | Judging + Demo Day |
| 1.4 | UI/UX polish pass | P1 | M | ⭑⭑ | Video quality, first impression |
| 1.5 | Submission package assembly | P0 | S–M | ⭑⭑⭑ | The actual entry |

### 1.1 Browser QA sweep + demo-state lock — `P0 · M · ⭑⭑⭑`

The write path is proven by `smoke-write.mts`, but that runs headless with random keypairs. Real-browser QA on the actual UI (with the personas in `localStorage`) is the one thing that turns "it works in a script" into "it works on stage."

**Test matrix (drive it on the real UI):**

| Flow | Component / call | Watch for |
|---|---|---|
| Create pool | `CreatePool.tsx` → `createPool()` (`lib/livepool.ts`) | Friendbot funding, `ensureTrustline`, `POST /pool/create`, `/faucet`, 3 seed `contribute` calls all succeed in order |
| Contribute | `routes/Contribute.tsx` → `contribute(name, amt)` | persona picker signs client-side; balance updates |
| Request spend | `routes/Spend.tsx` → `request_spend` | over-limit rejects on the spot (`Error #3 OverCategoryLimit`) |
| Approvals | per-officer approval chips | Release button stays disabled until `approvals ≥ threshold` (2) |
| Release | `execute(spend_id)` | permissionless push works; returns tx hash |
| Ask AI | Home Ask box → `POST /ask` | grounded answer, pesos, no invented numbers |
| Rules parse | `routes/Setup.tsx` → `POST /rules` | sentence → policy JSON, zod-valid |
| Live card | `LiveOnChain.tsx` | 15s refetch shows fresh on-chain state |
| Start over | Setup → `clearPool()` + `resetPersonas()` | clears `kolektibo.contract`, `kolektibo.personas.v1`, `kolektibo.payee.v1` |

**Known gotchas to explicitly verify (all documented in the repo):**

- **Backend must be up** at `http://localhost:8787` — `create`, `faucet`, `rules`, `ask` all route through it. Confirm `GET /health` returns `{ ok, model, hasKey: true }` (i.e. `OPENAI_API_KEY` is set).
- **Trustline-before-transfer:** a fresh payee cannot receive USDC until `change_trust` (see `DEPLOYMENT.md §4.2`). `createPool()` handles this for personas + payee; verify no manual step is missing.
- **Friendbot rate limits / testnet resets** can fail funding — retry logic and a graceful error toast matter for a live demo.
- **Pool fallback:** `activePoolId()` (`lib/contract.ts`) returns the browser-created pool **or** the canonical `CBR36Q2…INF2`. If `localStorage` is cleared mid-demo, the app silently falls back to the canonical pool — decide and document which pool the demo runs against.
- **Units:** every amount is `raw = human × 1e7` (`SCALE`). Spot-check that displayed pesos match on-chain raw.

**Deliverable / acceptance:** the full 7-step loop completes twice in a row in a clean browser profile (desktop Chrome + mobile viewport), plus one deliberate revert demo (single-officer `execute` → `Error #6 NotEnoughApprovals`). Freeze the demo pool's contract ID and note it in the demo script.

### 1.2 Demo script + demo video — `P0 · M–L · ⭑⭑⭑`

The video is the judges' primary artifact. Script it to the loop; make the **moat (steps 5–6)** the emotional beat.

**Script beats (target 2–3 min, or the required length):**

```
0:00  The problem — one treasurer, one notebook, blind trust. "Where did the money go?"
0:20  Create a pool; type the rule in plain English:
      "₱200 per member monthly, spends over ₱5k need 2 of 3 officers."
0:35  AI turns the sentence into an on-chain policy (POST /rules).
0:50  Members contribute USDC into the treasury contract.
1:05  An officer requests a spend — contract checks the category limit live.
1:20  ⭑ THE MOAT ⭑ Show ONE officer try to release → REVERT Error #6 NotEnoughApprovals.
      "No single person — not even the AI — can move the money."
1:40  Second officer approves → 2-of-3 met → contract releases real USDC. Show the tx on stellar.expert.
2:00  Ask the AI "how much do we have, and where did it go?" → plain answer grounded in on-chain history.
2:20  Close: settles in USDC on Stellar, fractions-of-a-cent fees, GCash-native context, composable.
```

**Effort split:** script draft `S`, screen recording `M`, edit/caption `M`. Record on a mobile viewport to reinforce the mobile-first, GCash-native framing.

**Acceptance:** a single continuous take of the live loop with the revert included, plus a link to the on-chain proof tx.

### 1.3 Pitch deck — `P0 · M · ⭑⭑⭑`

Map the deck 1:1 to the judging steer.

| Slide | Content | Judging hook |
|---|---|---|
| Problem | The Filipino pooled-money trust vacuum | Real utility |
| Solution | AI treasurer + Soroban contract; "the moat is the contract, not the AI" | Differentiation |
| Demo loop | The 7 steps, moat highlighted | Real utility |
| Proof | Contract IDs + proof tx `127e4e3f…31278`, 4/4 tests | Credibility |
| Local fit | USDC settlement, pesos-first, GCash-native, barangay/co-op/*pondohan* | Local anchors/assets |
| Composability | Yield (Blend), SEP-24 on/off-ramp (GCash), the contract as shared state | Composability |
| Tech | Rust/soroban-sdk 26, Stellar CLI 27, React 19/Vite/TanStack, Express+OpenAI | Execution |
| Roadmap | This document, condensed | Vision |

**Acceptance:** deck exports to PDF; every claimed number matches the repo (contract IDs, tx hash, test counts, versions).

### 1.4 UI/UX polish pass — `P1 · M · ⭑⭑`

Targeted polish that shows up on camera; not a redesign.

- Loading/empty/error states for every `TanStack Query` hook (`usePool`, `usePoolBalance`, `useCreatePool` progress, `usePoolActions`), so the demo never shows a raw spinner or an unhandled reject.
- Progress UX during `createPool()` — it already emits `onProgress` messages ("Setting up Kap. Ramon…", "Deploying your treasury on Stellar…"); surface them as a clean step list.
- Peso formatting consistency (`₱1,200`) across Home hero, budgets, activity.
- Mobile portrait check against the PWA manifest (`vite.config.ts`: `display: standalone`, `orientation: portrait`, `theme_color #0f766e`).
- Approval chips + Release-button gating readable at a glance (color the threshold state).

**Acceptance:** no dead-end states in the demo path; looks intentional at phone width.

### 1.5 Submission package assembly — `P0 · S–M · ⭑⭑⭑`

Assemble the entry with buffer before the Jul 15 deadline.

**Checklist:**

- [ ] Public repo link (ensure `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, and the `docs/` set are current).
- [ ] Deployed testnet links: canonical treasury `CBR36Q2…INF2`, first treasury `CBPAYE…3JLR`, USDC SAC `CDTC…QR`, issuer `GBYFI…55HM`, proof tx `127e4e3f…31278` — all on `https://stellar.expert/explorer/testnet/`.
- [ ] Demo video (hosted + linked).
- [ ] Pitch deck (PDF).
- [ ] Written description mapping to real-utility / local-assets / composability.
- [ ] Setup/run instructions (`pnpm install`; `pnpm dev`; `pnpm contract:deploy`).
- [ ] Team + regional eligibility (Philippines / APAC).

**Acceptance:** a dry-run submission reviewed by the whole team ≥ 24h before the deadline.

---

## 2. Stretch / composability — ship if the loop is rock-solid (P2)

Composability is **explicitly judged.** Even where a full integration is out of scope in the remaining days, the contract is already the shared, composable state layer, so each of these is at minimum a strong narrated slide and at best a live one-click.

| # | Item | Priority | Effort | Impact | Judging hook |
|---|---|---|---|---|---|
| 2.1 | Yield on idle funds (Blend) | P2 | XL (live) / S (narrated) | ⭑⭑⭑ | Composability + DeFi |
| 2.2 | SEP-24 anchor on/off-ramp (GCash story) | P2 | L–XL (live) / S (narrated) | ⭑⭑⭑ | Local anchors — direct steer hit |
| 2.3 | Capacitor native build | P2 | M | ⭑⭑ | Mobile-first distribution |

### 2.1 Yield on idle funds via Blend — `P2 · XL live / S narrated · ⭑⭑⭑`

**Thesis:** a pooled fund sits idle between spends; idle USDC should earn transparent, on-chain yield the whole group can see — without anyone gaining custody.

**Why it fits us:** the treasury holds USDC as a Stellar Asset Contract, and Blend is a Soroban lending protocol — so a treasury balance can be supplied to a Blend pool and redeemed, all on-chain and all auditable, exactly the composability judges want.

**Live-integration sketch (post-deadline realistic; only if the loop is untouchable):**

```
[ treasury USDC ] ──supply──▶ [ Blend pool ] ──accrues yield──▶ redeem ──▶ [ treasury USDC + yield ]
        │                                                                          │
        └── needs a new contract entrypoint (e.g. invest_idle / redeem) gated ─────┘
            by the SAME M-of-N officer policy, so idle-fund moves are as governed
            as spends. Yield is a transparent line item the AI can explain.
```

- **Contract work:** add officer-gated `invest_idle(amount)` / `redeem(amount)` calling the Blend pool client; reuse `require_officer` + threshold semantics so moving money into yield is as policed as spending it.
- **Cheap win now:** narrate it as the composability roadmap with the diagram above — no code risk to the demo.

**Impact:** high — the single clearest composability + DeFi story. **Risk:** high if attempted live pre-deadline; keep it narrated unless P0 is finished with slack.

### 2.2 SEP-24 anchor on/off-ramp — the GCash story — `P2 · L–XL live / S narrated · ⭑⭑⭑`

This is the most on-target composability item because it maps directly to the "local anchors / on-off-ramps" judging steer.

**The story:** today members must already hold test USDC (we faucet it). In production, a member tops up with **GCash → an SEP-24 anchor mints USDC into their Stellar account → they contribute** to the pool; a payee cashes out **USDC → anchor → GCash/bank.** The trustline lesson we already handle (`DEPLOYMENT.md §4.2`) is exactly what an anchor automates.

```
GCash / bank ──▶ [ SEP-24 anchor deposit ] ──▶ USDC in member account ──▶ contribute() ─▶ treasury
treasury ──▶ execute() ──▶ USDC to payee ──▶ [ SEP-24 anchor withdraw ] ──▶ GCash / bank
```

- **Live path:** wire a testnet SEP-24 flow (interactive deposit/withdraw popup) against a reference anchor; label it honestly as a testnet on/off-ramp (matches `ARCHITECTURE.md`'s "simulated via testnet SEP-24 flow, labeled honestly").
- **Cheap win now:** a single slide + the diagram; the app already produces standard Stellar accounts + USDC trustlines, so nothing blocks a future anchor.

**Impact:** high (direct steer hit). **Effort:** L–XL for a real interactive flow; S to narrate.

### 2.3 Capacitor native build — `P2 · M · ⭑⭑`

The app is already a **Capacitor-ready PWA** — `vite build` emits a static `dist/`, and `vite-plugin-pwa` is configured.

- Add `@capacitor/core` + `@capacitor/cli`, a `capacitor.config.ts` (`webDir: 'dist'`), then `npx cap add android` / `ios` and `npx cap copy`.
- Note: `@stellar/stellar-sdk` already runs in-browser via `vite-plugin-node-polyfills` (Buffer/global/process), so the WebView build inherits that.
- Deliverable: an installable Android APK to hold up on camera — reinforces "mobile-first, GCash-native."

**Impact:** medium (nice-to-have distribution proof). **Effort:** M. **Risk:** low — no change to the core loop.

---

## 3. Hardening — production path (P3, post-hackathon)

None of these hold any authority over money — the **blockchain remains the database** for all trust-critical state. They are the metadata, indexing, identity, and notification layers a real deployment needs. Ordered by production priority.

| # | Item | Priority | Effort | Impact | Money authority |
|---|---|---|---|---|---|
| 3.1 | Real wallets / passkeys (replace custodial personas) | P3 | XL | ⭑⭑⭑ | Custody moves to the user — the point |
| 3.2 | Multi-device + minimal off-chain directory DB | P3 | L–XL | ⭑⭑ | **Zero** |
| 3.3 | Soroban event indexer | P3 | L | ⭑⭑ | **Zero** (read-only) |
| 3.4 | Notifications | P3 | M | ⭑ | **Zero** |

### 3.1 Real wallets / passkeys — replace custodial personas — `P3 · XL · ⭑⭑⭑`

**The single biggest production gap.** Today the three officer personas (Kap. Ramon, Aling Nena, Kuya Jun) are **in-browser keypairs whose secrets sit in plaintext `localStorage`** (`kolektibo.personas.v1`, generated in `lib/wallet.ts`), signed client-side via `basicNodeSigner`. That is correct and honest for a single-device demo (no secret ever leaves the device or ships in the bundle), but it is custodial-per-browser and not production identity.

**Target:** each officer is a distinct real signer.

- **Desktop:** Freighter — `@stellar/freighter-api` (`^6.0.1`) is **already a dependency**; swap the `basicNodeSigner` path for the Freighter signer for personas that map to a real wallet. `ARCHITECTURE.md` already names Freighter as the "real wallet" desktop story.
- **Mobile:** passkeys / smart-wallet signing (secp256r1) so a non-crypto member approves a spend with Face ID / fingerprint and never sees a seed phrase — the ideal UX for the target user.
- **Contract impact:** none to the trust model — `approve`/`request_spend` already `require_auth` per officer `Address`; only the signer implementation changes.

**Impact:** high (this is what makes it real). **Effort:** XL (passkey path especially).

### 3.2 Multi-device + minimal off-chain directory DB — `P3 · L–XL · ⭑⭑`

Today human names live only in `lib/wallet.ts` and `readPool()` even hard-codes the pool name (`'Barangay 143 Basketball League'`) and dues; a second device knows none of this. A **thin, non-authoritative** directory service closes that gap.

```
        AUTHORITY (never here)                 CONVENIENCE (safe to keep off-chain)
   ┌──────────────────────────────┐      ┌───────────────────────────────────────┐
   │  Soroban treasury contract    │      │  Directory DB (Postgres/SQLite/KV)     │
   │  • balances                    │      │  • address → human name                │
   │  • approvals / threshold       │◄────►│  • pool directory (name, id)           │
   │  • spend history               │ keyed│  • membership roster                   │
   │  • category limits             │  by  │  • notification prefs                  │
   │  = source of truth for MONEY   │ addr │  = ZERO authority over money           │
   └──────────────────────────────┘      └───────────────────────────────────────┘
```

- **Rule:** the DB is keyed by on-chain `Address`/contract id and holds only labels and membership; if the DB is wiped, **not one cent is at risk** — the contract still governs every move.
- Enables cross-device membership, a pool directory, and human-readable names shared across a group instead of per-browser.

**Impact:** medium. **Effort:** L–XL (needs a real service + auth for writes, still money-authority-free).

### 3.3 Soroban event indexer — `P3 · L · ⭑⭑`

Today history is read by `get_spends()`, which loops `1..NextSpendId` and does one storage read per spend on **every** call (`lib.rs`) — fine for a demo, O(n) at scale. The contract already emits `contrib`, `spend_req`, `approve`, `execute` events (`env.events().publish`).

- Build an indexer that ingests those four events into a queryable store → instant activity feeds, per-member contribution history, and the data backbone for notifications.
- Read-only: it observes on-chain events; it never signs or moves anything.

**Impact:** medium (scale + UX). **Effort:** L.

### 3.4 Notifications — `P3 · M · ⭑`

Approvals are asynchronous — an officer needs to know a spend is waiting on them.

- Web Push / PWA notifications for: "a spend needs your approval," "2-of-3 met — funds released," "a contribution landed."
- Driven by the event indexer (3.3); notification prefs live in the directory DB (3.2), not on-chain.

**Impact:** low individually, but it's what makes the M-of-N flow usable when officers aren't in the same room. **Effort:** M.

---

## Prioritization summary

### Impact vs. effort

```
 IMPACT
  high │  1.2 Demo video          1.1 Browser QA           2.1 Blend (live)
       │  1.3 Pitch deck          2.2 SEP-24 (narrated)    2.2 SEP-24 (live)
       │  1.5 Submission pkg      2.1 Blend (narrated)     3.1 Real wallets/passkeys
       │
   med │  1.4 UI/UX polish        2.3 Capacitor            3.2 Directory DB
       │                          3.3 Event indexer
       │
   low │                          3.4 Notifications
       └──────────────────────────────────────────────────────────────────────►
          low effort (S)          medium (M)               high (L / XL)   EFFORT

   Do first: high-impact / low-effort  →  1.2, 1.3, 1.5, 2.1&2.2 narrated
   Protect:  high-impact / high-effort →  1.1 (must), stretch/hardening only after P0
```

### Single ranked backlog

| Rank | Item | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | Browser QA sweep + demo-state lock | P0 | M | ⭑⭑⭑ |
| 2 | Demo script + demo video | P0 | M–L | ⭑⭑⭑ |
| 3 | Submission package assembly | P0 | S–M | ⭑⭑⭑ |
| 4 | Pitch deck | P0 | M | ⭑⭑⭑ |
| 5 | UI/UX polish pass | P1 | M | ⭑⭑ |
| 6 | Composability slides: Blend + SEP-24 (narrated) | P1 | S | ⭑⭑⭑ |
| 7 | SEP-24 anchor on/off-ramp (live) | P2 | L–XL | ⭑⭑⭑ |
| 8 | Yield on idle funds — Blend (live) | P2 | XL | ⭑⭑⭑ |
| 9 | Capacitor native build | P2 | M | ⭑⭑ |
| 10 | Real wallets / passkeys | P3 | XL | ⭑⭑⭑ |
| 11 | Multi-device + directory DB | P3 | L–XL | ⭑⭑ |
| 12 | Soroban event indexer | P3 | L | ⭑⭑ |
| 13 | Notifications | P3 | M | ⭑ |

> Rank 6 is deliberately above the live stretches: narrating Blend + SEP-24 as roadmap captures nearly all the composability judging credit for a fraction of the effort and **zero** risk to the working loop.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Testnet reset / Friendbot flakiness during the live demo | Med | Pre-fund + pre-deploy a locked demo pool; record a backup video; keep the canonical `CBR36Q2…INF2` pool as fallback |
| Backend (`localhost:8787`) not running → create/faucet/AI fail on stage | Med | Pre-flight `GET /health` check in the demo runbook; confirm `OPENAI_API_KEY` set |
| `localStorage` cleared mid-demo → silent fallback to canonical pool | Low | Note the exact pool id in the script; do a clean-profile dry run |
| Chasing a live stretch (Blend/SEP-24) destabilizes the working loop | Med | Freeze the loop first; stretches only on a branch, only after P0 done |
| Submission-portal surprises (formats, length limits) | Med | Dry-run submission ≥ 24h early; buffer to Jul 15 morning |

---

## Definition of done — submission (Jul 15)

- [ ] 7-step loop completes twice in a clean browser + once on mobile viewport, incl. a live revert (`Error #6`).
- [ ] Demo video recorded, edited, hosted, linked.
- [ ] Pitch deck exported to PDF; every number matches the repo.
- [ ] Written description hits all three judging axes (utility · local assets · composability).
- [ ] Repo public and current (`README`, `ARCHITECTURE`, `DEPLOYMENT`, `docs/`).
- [ ] All testnet artifacts + proof tx linked on stellar.expert.
- [ ] Composability roadmap (Blend + SEP-24) present at least as narrated slides.
- [ ] Team dry-run review complete with ≥ 24h buffer before the deadline.

**Bottom line:** the moat is built and proven on-chain. The remaining work is to make the finished thing legible, credible, and unmissable to the judges — and to point clearly at the composable, GCash-native future that the contract already makes possible.
