# Kolektibo — Architecture

> **Kolektibo** — AI-Governed Group Treasury on Stellar.
> An AI treasurer for any pooled fund (barangay committees, church collections, co-ops,
> reunion funds, team _pondohan_), made trustworthy by a Soroban smart contract.
> The AI does the labor of a human treasurer; the money lives in a contract that only lets it
> execute what the group's on-chain policy allows.

> **Status — built & verified on Stellar Testnet.** The full loop below runs today. The Soroban
> contract is written and **deployed** (4/4 unit tests pass); the create-pool → contribute →
> request → 2-of-3 approve → release → AI-Q&A loop is wired client-side and **verified
> end-to-end** — Node smoke tests plus a live Playwright walkthrough (all QA findings resolved).
> Live contract IDs and proof transactions: [`DEPLOYMENT.md`](./DEPLOYMENT.md). Full documentation
> set (11 topic docs + QA report): [`docs/`](./docs) → start at [`docs/00-INDEX`](./docs/00-INDEX_2026-07-11_0146.md).

---

## The demo loop (the whole pitch)

This single loop is what everything serves.

1. **Create a pool** and set its rules in plain English.
2. AI turns _"₱200 per member monthly, spends over ₱5k need 2 of 3 officers"_ into a **policy** the contract enforces.
3. **Members contribute USDC** into the treasury contract.
4. An officer **requests a spend**. The contract checks the category limit on the spot.
5. The contract **collects the required 2-of-3 approvals** before it will release anything.
6. The contract **releases USDC** to the recipient — and only then.
7. Any member asks the AI **"how much do we have, and where did it go?"** → a plain-language answer grounded in on-chain history.

**The moat is steps 4–6, not the AI.** The AI can't play favorites, can't be bribed, and can't
drain the fund — it can only ever call a contract that enforces the group's policy.

---

## System shape

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web — Capacitor-ready PWA (Vite 8 · React 19 · TanStack · Tailwind)  │
│  • 3 in-browser officer "personas" (localStorage keypairs) sign client-side │
│  • generated contract bindings + @stellar/stellar-sdk                       │
│  • reads chain state via Soroban RPC; formats ₱ over USDC                    │
└───────┬──────────────────────────────────────────────┬───────────┘
        │ signed contract calls (create/contribute/      │ NL rules + grounded Q&A
        │ request/approve/execute) via Soroban RPC        │ (chain state passed in)
        ▼                                                 ▼
┌────────────────────────────────┐        ┌────────────────────────────────────┐
│ contracts/treasury (Soroban)    │        │ services/ai (Node · Express · OpenAI)│
│  holds USDC (SAC) · enforces    │        │  AI:    /rules  /ask                 │
│  category caps + M-of-N approval│        │  Chain: /config /faucet /pool/create │
│  every movement on-chain        │◄───────┤  (deploy/init/mint via local          │
└───────────────┬────────────────┘ deploy  │   Stellar CLI keystore — no secrets)  │
                │ settles in       + faucet └────────────────────────────────────┘
                ▼
        Stellar Testnet · USDC as a SAC · Friendbot funding
```

- **The AI never holds keys and never moves money.** It reads chain state (passed to it by the
  client) and produces (a) a proposed policy for display and (b) plain-language answers. Every
  actual movement is a signed contract call enforced on-chain.

---

## Components

### `contracts/treasury` — Soroban (Rust) — the trust core
One deployed instance = one pool. Holds the pooled USDC (as a Stellar Asset Contract) and only
releases it when the group's on-chain policy is satisfied. `soroban-sdk 26`, built with Stellar
CLI 27. Full reference: [`docs/03-smart-contract`](./docs/03-smart-contract_2026-07-11_0146.md).

**State:** token (USDC SAC address), officers `Vec<Address>`, approval `threshold: u32`,
per-category spend caps, per-member contributions, and spend requests
(`id → { proposer, category, amount, recipient, memo, approvals, executed }`).

**Interface (as deployed):**
| fn | who | does |
|---|---|---|
| `initialize(token, officers, threshold, categories, limits)` | deployer | one-time setup |
| `contribute(from, amount)` | any member (`require_auth`) | pulls USDC into the treasury, records contribution |
| `request_spend(proposer, category, amount, recipient, memo) -> id` | officer (`require_auth`) | opens a spend, rejects over-limit, records the proposer's own approval |
| `approve(officer, spend_id)` | officer (`require_auth`) | records one more approval |
| `execute(spend_id)` | **anyone** | reverts unless `approvals ≥ threshold`; transfers USDC; marks executed |
| views | — | `get_balance`, `get_spends`, `get_spend`, `get_officers`, `get_threshold`, `get_members`, `get_contribution`, `get_categories`, `get_next_spend_id` |

Approvals are real signatures: each `approve` is `require_auth`'d, so the contract knows the
approval came from that officer — no impersonation. Ten typed error codes (e.g. `NotOfficer`,
`OverCategoryLimit`, `NotEnoughApprovals`). Note: **category caps are per-spend**, and **dues are
off-chain** (a display/contribution target, not enforced by the contract) — deliberate MVP
simplifications, documented in [`docs/08-decisions`](./docs/08-decisions-and-rationale_2026-07-11_0146.md).

### `services/ai` — Node + Express — AI treasurer **and** chain-ops backend
A small local backend so no secret ever ships to the client. Full reference:
[`docs/04-backend-and-ai`](./docs/04-backend-and-ai_2026-07-11_0146.md).
- **AI (OpenAI SDK):** `POST /rules {text}` → validated JSON policy for display; `POST /ask {question, state}` → plain-language answer grounded in the pool state + spend history the client fetched from chain.
- **Chain ops (via the machine's Stellar CLI keystore):** `GET /config` (public chain config), `POST /faucet {address}` (mints test USDC), `POST /pool/create {officers, threshold}` (deploys + initializes a fresh treasury for the browser's officer keys). The CLI holds the issuer/deployer identities — **no secrets in code, env, or the bundle**.

### `apps/web` — Capacitor-ready PWA
Vite 8 + React 19 + **TanStack Router** (code-based, type-safe) + **TanStack Query** (all chain/AI
reads are query hooks — caching, refetch, loading/error states) + Tailwind v4 + `vite-plugin-pwa`.
Full reference: [`docs/05-frontend`](./docs/05-frontend_2026-07-11_0146.md).
- **In-browser officer personas** (`Kap. Ramon`, `Aling Nena`, `Kuya Jun`) are keypairs generated and kept in `localStorage`; the app signs each officer's approval **client-side** (`basicNodeSigner`) — no browser-extension dependency, no secrets exposed.
- **Generated contract bindings** (`stellar contract bindings typescript`) give a typed client over Soroban RPC. `livepool.ts` orchestrates the create-pool flow and all reads/writes; `vite-plugin-node-polyfills` supplies `Buffer` for stellar-sdk in the browser.
- **Display:** the group thinks in **₱** (1 USDC ≈ ₱1 for the demo) while settlement is **USDC** on-chain (`raw = ₱ × 1e7`, since the USDC SAC has 7 decimals).
- Static `dist/` → wrap with Capacitor for an installable build (stretch; PWA today).

---

## Signing & key-handling model

- **Officers sign in the browser.** Each pool's 3 officer keypairs are generated in-browser and
  stored in `localStorage`; approvals are signed client-side. The moat (2-of-3 enforcement) is on
  the contract, so no key ever needs to leave the device.
- **The local backend deploys with the CLI keystore.** `POST /pool/create` and `/faucet` use the
  deployer/issuer identities already in the machine's Stellar CLI keystore — secrets are never
  materialized into code, env files, the transcript, or the client bundle.
- **Our database is the blockchain.** All trust-critical state (balances, officers, threshold,
  spends, approvals) lives on-chain and is read back via Soroban RPC. `localStorage` holds only
  client wallet state; the backend is stateless. See
  [`docs/02-architecture`](./docs/02-architecture_2026-07-11_0146.md) for why, and when an
  off-chain directory DB becomes warranted (multi-device names/membership — with zero authority
  over money).

---

## What's built vs. what's next

| Capability | Status |
|---|---|
| Soroban policy contract + M-of-N approvals | ✅ **built, deployed, 4/4 tests** |
| USDC settlement (test USDC as a SAC) | ✅ **built** |
| AI: NL → policy (display) + grounded Q&A | ✅ **built** (OpenAI) |
| Create-your-own-pool onboarding + USDC faucet + trustlines | ✅ **built** |
| On/off-ramp (GCash / SEP-24 anchor) | ⏳ next — today it's a **testnet faucet + client-side trustlines**; a real anchor flow is the composability story |
| Yield on idle funds (Blend / Soroswap) | ⏳ next — composability |
| Multi-device (shared directory service) | ⏳ next — single-browser today (keys in `localStorage`) |
| Native mobile | PWA today; Capacitor wrap = stretch |

Roadmap detail: [`docs/10-roadmap-and-next-steps`](./docs/10-roadmap-and-next-steps_2026-07-11_0146.md).

---

## Delivered

The original 4-day plan (Day 1 scaffold → Day 4 polish/QA) was executed in a **single build
session** on 2026-07-11: toolchain → monorepo → contract (deployed, tested) → AI + chain-ops
backend → PWA with the full client-signed loop → on-chain verification → docs → a live Playwright
QA pass with all findings fixed and re-verified. The blow-by-blow is in
[`docs/07-progress-log`](./docs/07-progress-log_2026-07-11_0146.md).

---

## Stack

| Layer | Choice |
|---|---|
| Contract | Rust 1.97 · `soroban-sdk 26` · Stellar CLI 27 · Testnet · target `wasm32v1-none` |
| Asset | USDC as a Stellar Asset Contract (SAC) on testnet |
| Web | Vite 8 · React 19 · TypeScript · Tailwind v4 · `vite-plugin-pwa` · `vite-plugin-node-polyfills` |
| Routing / data | TanStack Router (code-based) · TanStack Query |
| Chain client | `@stellar/stellar-sdk 16` + generated contract bindings |
| Backend | Node · Express 5 · OpenAI SDK 6 · zod · `tsx` |
| Mobile | PWA → Capacitor (stretch) |
| Pkg mgr | pnpm workspaces |
| QA | Playwright MCP (headed, slow-mo) — see [`docs/playwright-mcp-guide`](./docs/playwright-mcp-guide_2026-07-11_0220.md) |
