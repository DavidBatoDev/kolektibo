# Kolektibo — Architecture & 4-Day Build Plan

> **Kolektibo** — AI-Governed Group Treasury on Stellar.
> An AI treasurer for any pooled fund (barangay committees, church collections, co-ops,
> reunion funds, team _pondohan_), made trustworthy by a Soroban smart contract.
> The AI does the labor of a human treasurer; the money lives in a contract that
> only lets it execute what the group's on-chain policy allows.

---

## The winning demo loop (memorize this)

This single loop is what we build to. Everything else is supporting cast.

1. **Create a pool** and set its rules in plain English.
2. AI turns _"₱200 per member monthly, spends over ₱5k need 2 of 3 officers"_ into an **on-chain policy**.
3. **Members contribute USDC** into the treasury contract.
4. An officer **requests a spend** (pay the contractor). Contract checks the category limit.
5. Contract **collects the required 2-of-3 approvals** before it will release anything.
6. Contract **releases USDC** to the recipient — and only then.
7. Any member asks the AI **"how much do we have, and where did it go?"** → plain-language answer, grounded in on-chain history.

**The moat is step 5–6, not the AI.** The AI can't play favorites, can't be bribed, can't
drain the fund — because it can only ever call a contract that enforces the group's policy.

---

## System shape

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web  — Capacitor-ready PWA (Vite + React + TS + Tailwind)│
│  mobile-first UI · in-app testnet keypairs (demo) / Freighter  │
└───────────────┬─────────────────────────────┬─────────────────┘
                │ reads/writes contract        │ NL rules + Q&A
                │ via @stellar/stellar-sdk      │ (state passed in)
                ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────┐
│ contracts/treasury (Soroban)   │   │ services/ai (Node + OpenAI)│
│  holds USDC · enforces policy  │   │  POST /rules  NL → policy  │
│  M-of-N approvals · history    │   │  POST /ask    Q&A on state │
└───────────────┬───────────────┘   └───────────────────────────┘
                │ settles in
                ▼
        Stellar Testnet (USDC as a SAC) · Friendbot funding
```

- **The AI never holds keys and never moves money.** It reads chain state (passed to it by the
  client) and produces (a) a proposed policy the officers confirm, and (b) answers. Every
  actual movement is a signed contract call enforced on-chain.

---

## Components

### `contracts/treasury` — Soroban (Rust) — the trust core
Scaffolded with `stellar contract init` (so versions/toolchain are correct), then we replace
the sample with the treasury logic. One contract instance = one pool.

**State:** token (USDC SAC address), officers `Vec<Address>`, approval `threshold: u32`,
monthly dues, per-category spend limits, per-member contributions, spend requests
(`id → { proposer, category, amount, recipient, memo, approvals, executed }`).

**Interface (draft):**
| fn | who | does |
|---|---|---|
| `initialize(token, officers, threshold, dues, category_limits)` | deployer | one-time setup |
| `contribute(from, amount)` | any member | pulls USDC into the treasury, records contribution |
| `request_spend(proposer, category, amount, recipient, memo) -> id` | officer | opens a spend, checks category limit |
| `approve(id)` | officer (`require_auth`) | records one approval |
| `execute(id)` | anyone | reverts unless `approvals ≥ threshold`; transfers USDC; marks executed |
| `get_pool()` / `get_spends()` / `get_contributions()` | view | feeds the app + AI |

Approvals are real signatures: each officer's `approve` call is `require_auth`'d, so the
contract knows the approval came from that officer — no impersonation.

### `services/ai` — Node + OpenAI SDK
Tiny backend so the `OPENAI_API_KEY` never ships to the client.
- `POST /rules { text }` → validated JSON policy `{ dues, categories:[{name, monthlyLimit}], approval:{threshold, of} }` (officers confirm before it goes on-chain).
- `POST /ask { question, state }` → plain-language answer grounded in the pool state + spend history the client fetched from the chain. Cites tx hashes.

### `apps/web` — Capacitor-ready PWA
Vite + React + TS + Tailwind, mobile-first. **TanStack Router** (type-safe file-based routing)
+ **TanStack Query** (all chain/AI reads go through query hooks — caching, refetch, loading
states for free). `@stellar/stellar-sdk` for building/submitting contract calls and reading state. Demo identity: in-app testnet keypairs funded by Friendbot
(no browser-extension dependency on mobile); Freighter supported as the "real wallet" story on desktop.
Static `dist/` → wrap with Capacitor for an installable build (stretch).

---

## Build real vs. honestly stub (4-day discipline)

| Component | Verdict |
|---|---|
| Soroban policy contract + M-of-N approvals | **Real, on testnet** — non-negotiable |
| USDC settlement (test USDC as a SAC) | **Real** |
| AI: NL → policy, and Q&A over chain history | **Real** (OpenAI) |
| On/off-ramp (GCash / anchor) | **Simulated** via testnet SEP-24 flow, labeled honestly |
| Yield on idle funds (Blend/Soroswap) | **Stretch** — one-click if time; otherwise narrated as composability |
| Native mobile | **PWA now**, Capacitor wrap as stretch |

---

## 4-day timeline (today = Jul 11, deadline Jul 15)

- **Day 1 (Jul 11):** toolchain installed · monorepo scaffolded · web app runs · AI service runs · a real testnet transaction confirmed end-to-end.
- **Day 2 (Jul 12):** treasury contract written, deployed to testnet · web app reads pool state · contribute + request/approve/execute wired and working with test USDC.
- **Day 3 (Jul 13):** AI `/rules` + `/ask` live · full demo loop polished · mobile UI cleaned up · simulated on-ramp flow.
- **Day 4 (Jul 14):** hardening · demo script + recording · deck · deploy the PWA to a public URL · stretch (yield / Capacitor build) only if the loop is rock-solid.
- **Jul 15:** submit with buffer.

---

## Stack

| Layer | Choice |
|---|---|
| Contract | Rust, `soroban-sdk`, Stellar CLI 27, Testnet |
| Asset | USDC as a Stellar Asset Contract (SAC) on testnet |
| Web | Vite + React + TypeScript + Tailwind + `vite-plugin-pwa` |
| Routing / data | TanStack Router + TanStack Query |
| Chain client | `@stellar/stellar-sdk` (+ `@stellar/freighter-api` on desktop) |
| AI | Node + `openai` SDK (backend proxy) |
| Mobile | PWA → Capacitor (stretch) |
| Pkg mgr | pnpm workspaces |
