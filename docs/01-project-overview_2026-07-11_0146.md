# Kolektibo — Project Overview
_Created: 2026-07-11 01:46 MPST · Kolektibo · Stellar Testnet_

**AI-Governed Group Treasury on Stellar.** An AI treasurer for any pooled fund, made trustworthy by a Soroban smart contract. The AI does the labor of a human treasurer; the money lives in a contract that only ever releases what the group's own on-chain policy allows — so no single officer, and not even the AI, can drain the fund.

Built for the **APAC Stellar Hackathon 2026**. This document is the single, authoritative overview for the build team and the judges: the vision, the problem, the solution, who it is for, the demo we win on, the hackathon context, what the name means, and where the project stands today.

---

## 1. The name

**Kolektibo** is Tagalog for *pooled capital* — money gathered together toward a shared goal. It is exactly the object the product governs: a common fund that a group of ordinary people builds up and spends down together. The name is chosen to be immediately legible to the target user (a Filipino who already runs or belongs to a *pondohan*, a co-op, or a barangay committee), while the tagline — *AI-Governed Group Treasury on Stellar* — states plainly what makes it new.

---

## 2. The vision

Every pooled fund today runs on the same fragile machine: **a notebook and blind trust in one person.** Kolektibo replaces both.

- Replace the **notebook** with an on-chain ledger that is complete, tamper-evident, and answerable in plain language by an AI.
- Replace the **single trusted treasurer** with a smart contract that mechanically enforces the group's rules — spend categories, per-category limits, and M-of-N officer approvals — so trust is placed in *code the whole group can read*, not in one person's honesty.

The AI is the *interface and the labor*. The contract is the *authority over money*. The vision is a treasury that is as easy to run as chatting with a helpful treasurer, but as safe as a multisig — for groups who have never touched a wallet, a seed phrase, or a block explorer.

> **The moat is the contract, not the AI.** The AI can't play favorites, can't be bribed, and can't drain the fund — because it can only ever call a contract that enforces the group's policy on-chain.

---

## 3. The problem — the Filipino pooled-money trust vacuum

Filipinos pool money constantly:

- **Barangay** project funds and committee budgets
- **Church / community-org** collections
- **Cooperative** share capital
- **Savings / investment clubs** (*paluwagan*-style rotating funds)
- **Class, alumni, and reunion** funds
- **Team / group** *pondohan*
- **Small-business partnerships**

Almost all of it is managed the same way: **one treasurer, one notebook, and blind trust.** That arrangement has a single point of failure and a structural opacity problem:

| Failure mode | What it looks like on the ground |
|---|---|
| Misuse / "borrowing" | The treasurer quietly dips into the fund and means to pay it back — sometimes they do, sometimes they don't. |
| Opaque records | The ledger lives in one person's notebook or phone; members can't independently verify it. |
| No answer to "where did the money go?" | When something is off, there is often no auditable trail — only one person's word. |
| Single point of failure | If the treasurer is unavailable, dishonest, or simply disorganized, the whole fund is stuck or at risk. |

This is a **collective-trust vacuum**: a group that fundamentally trusts *the collective* is forced to concentrate all custody and all bookkeeping in *one individual*, with no mechanism to bind that individual to the group's rules. Kolektibo closes exactly that gap.

---

## 4. The solution — an AI treasurer enforced by a smart contract

Kolektibo is an **AI treasurer whose every money-moving action is enforced by a Soroban smart contract.**

- The group sets its rules **in plain language.**
- The **AI turns the rules into an on-chain policy** and does the ongoing labor of a treasurer — tracking contributions and balances, drafting disbursements, and answering members' questions.
- The **money lives in a Soroban contract.** The AI (and any officer) can only ever *execute what the on-chain policy allows*: the right category, within the limit, and only after the required approvals have been collected.
- Settlement is in **USDC on Stellar**, with fractions-of-a-cent fees. Idle funds can earn transparent yield later — a composability story, not day-one scope.

### The separation of powers that makes it safe

```
                      Group's plain-language rules
                                  │
                                  ▼
        ┌───────────────────────────────────────────────┐
        │  AI TREASURER  (services/ai, Node + OpenAI)    │
        │  • turns rules → policy   • drafts spends       │
        │  • answers "where did the money go?"            │
        │  NEVER holds keys · NEVER moves money           │
        └───────────────────────────────┬────────────────┘
                                         │ proposes / reads (state passed in)
                                         ▼
        ┌───────────────────────────────────────────────┐
        │  TREASURY CONTRACT  (Soroban, Rust)            │
        │  • holds the USDC                               │
        │  • enforces category limits                     │
        │  • enforces M-of-N officer approvals            │
        │  • releases funds ONLY when policy is satisfied │
        └───────────────────────────────┬────────────────┘
                                         │ settles in
                                         ▼
                      Stellar Testnet · USDC as a SAC
```

**The AI never holds keys and never moves money.** It reads chain state that the client passes to it, and it produces (a) a proposed policy the officers confirm and (b) plain-language answers. Every actual movement of money is a signed contract call, enforced on-chain. That is the design decision that lets a group trust the automation.

### What the contract mechanically guarantees

One deployed contract instance **= one pool.** It holds the pool's USDC (as a Stellar Asset Contract) and enforces the policy. These trust guarantees are proven on-chain, not asserted in a pitch:

| Guarantee | Enforced by | Verified on-chain |
|---|---|---|
| A single officer cannot release funds | `execute` reverts unless `approvals ≥ threshold` | reverts `Error #6 NotEnoughApprovals` |
| An officer cannot approve twice to fake a quorum | duplicate check in `approve` | reverts `Error #7 AlreadyApproved` |
| A non-officer cannot propose a spend | `require_officer` in `request_spend` | reverts `Error #2 NotOfficer` |
| A spend cannot exceed its category cap | limit check in `request_spend` | reverts `Error #3 OverCategoryLimit` |

---

## 5. Target users

Organized groups of **ordinary Filipinos who pool money** — not crypto-natives. Mobile-first, GCash-native context.

- **Barangay committees** running project or event funds
- **Church and community organizations** managing collections
- **Cooperatives** holding share capital
- **Savings and investment clubs** (rotating / *paluwagan*-style funds)
- **Class, alumni, and reunion** committees
- **Small-business partnerships** with a shared operating pot

The common thread: a group that already trusts *each other* but needs a trustworthy way to hold and spend *their shared money* — with officers who can be non-technical and members who just want a straight answer about the balance.

---

## 6. The winning demo loop

This single seven-step loop is what the whole product is built to. Everything else is supporting cast.

```
1  CREATE POOL ─────► set rules in plain English
                      "₱200 per member monthly, spends over ₱5k need 2 of 3 officers"
                                   │
2  AI → POLICY ─────► AI turns the sentence into an on-chain policy
                                   │
3  CONTRIBUTE ──────► members contribute USDC into the treasury contract
                                   │
4  REQUEST SPEND ───► an officer requests a spend (pay the contractor)
                      contract checks the category limit
                                   │
5  COLLECT APPROVALS► contract collects the required 2-of-3 approvals
                      before it will release anything                ◄── the moat
                                   │
6  RELEASE ─────────► contract releases USDC to the recipient — and only then  ◄── the moat
                                   │
7  ASK THE AI ──────► any member asks "how much do we have, and where did it go?"
                      → plain-language answer, grounded in on-chain history
```

| Step | Actor | System action | Backed by |
|---|---|---|---|
| 1. Create a pool | Group / officer | Deploy a fresh treasury; enter rules in plain English | `/pool/create` → `initialize(...)` |
| 2. Rules → policy | AI | Parse the sentence into a structured policy (threshold, categories, limits, dues) | `POST /rules` (OpenAI) |
| 3. Contribute | Members | Pull USDC into the treasury, record contribution + member | `contribute(from, amount)` |
| 4. Request a spend | Officer | Open a spend; reject on the spot if over the category limit | `request_spend(...) -> u32` |
| 5. Collect approvals | Officers | Gather the required M-of-N real signatures | `approve(officer, spend_id)` |
| 6. Release funds | Anyone | Permissionless push, but reverts unless `approvals ≥ threshold`; transfers USDC | `execute(spend_id)` |
| 7. Ask the AI | Any member | Warm, plain-language answer grounded in on-chain state | `POST /ask` (OpenAI) |

**Steps 5 and 6 are the moat.** Anyone can *press* the release button (`execute` is permissionless), but the money only moves when the on-chain approval threshold is met. That is what turns "trust me" into "verify it."

---

## 7. How it is built (grounded in the repo)

### 7.1 Monorepo layout

```
contracts/treasury/   Soroban (Rust) contract — holds USDC, enforces policy & M-of-N approvals
apps/web/             Capacitor-ready PWA — Vite + React + TanStack Router/Query + Tailwind
services/ai/          Node + OpenAI SDK — natural-language rules & Q&A over on-chain history
packages/shared/      Shared TypeScript types (policy, pool, spend)
scripts/              Deploy & testnet helpers
```

pnpm workspaces (`packageManager: pnpm@11.9.0`, `engines.node: >=20`). `pnpm dev` runs the web app and the AI service together.

### 7.2 The trust core — `contracts/treasury/src/lib.rs`

One instance = one pool. Holds USDC as a Stellar Asset Contract (SAC) and enforces the policy. Written with `#![no_std]` and `soroban-sdk` 26.

**Public interface (exact signatures):**

```rust
// one-time setup; validates threshold and that categories.len() == limits.len()
fn initialize(env, token: Address, officers: Vec<Address>, threshold: u32,
              categories: Vec<Symbol>, limits: Vec<i128>)

fn contribute(env, from: Address, amount: i128)                    // from.require_auth()
fn request_spend(env, proposer: Address, category: Symbol,
                 amount: i128, recipient: Address, memo: String) -> u32   // officer only
fn approve(env, officer: Address, spend_id: u32)                  // officer only, once
fn execute(env, spend_id: u32)                                    // PERMISSIONLESS; gated by threshold

// read-only views (feed the app + the AI)
fn get_balance(env) -> i128
fn get_spend(env, id: u32) -> Option<SpendRequest>
fn get_spends(env) -> Vec<SpendRequest>
fn get_categories(env) -> Vec<CategoryInfo>
fn get_officers(env) -> Vec<Address>
fn get_threshold(env) -> u32
fn get_members(env) -> Vec<Address>
fn get_contribution(env, who: Address) -> i128
fn get_next_spend_id(env) -> u32
```

**Storage (`DataKey`):** `Token`, `Officers`, `Threshold`, `NextSpendId`, `Members`, `Categories`, `CategoryLimit(Symbol) -> i128`, `Contribution(Address) -> i128`, `Spend(u32) -> SpendRequest`.

**Structs:** `CategoryInfo { name: Symbol, limit: i128 }` (limit `0` = no cap); `SpendRequest { id, proposer, category, amount, recipient, memo, approvals: Vec<Address>, executed: bool }`.

**Errors (`contracterror`, `repr(u32)`):**

| # | Error | # | Error |
|---|---|---|---|
| 1 | `AlreadyInitialized` | 6 | `NotEnoughApprovals` |
| 2 | `NotOfficer` | 7 | `AlreadyApproved` |
| 3 | `OverCategoryLimit` | 8 | `InvalidInit` |
| 4 | `SpendNotFound` | 9 | `InsufficientBalance` |
| 5 | `AlreadyExecuted` | 10 | `NonPositiveAmount` |

**Events:** `contrib`, `spend_req`, `approve`, `execute` (via `env.events().publish`).

Approvals are **real signatures**: each officer's `approve` (and the proposer's auto-approval in `request_spend`) is `require_auth`'d, so the contract knows the approval came from that officer — no impersonation. `execute` is deliberately permissionless so any member can push funds *once officers agree*, while the threshold check makes early or unauthorized release impossible.

**Tests — 4 / 4 passing** (`contracts/treasury/src/test.rs`):

| Test | Asserts |
|---|---|
| `full_happy_path` | contribute → propose → approve to 2-of-3 → execute; vendor receives funds, balance decrements, spend marked executed |
| `cannot_execute_without_threshold` | `execute` with 1 approval reverts `Error::NotEnoughApprovals` (6); vendor balance stays 0 |
| `rejects_over_category_limit` | a 6,000 request against a 5,000 Equipment cap reverts `Error::OverCategoryLimit` (3) |
| `non_officer_cannot_propose` | a plain member's `request_spend` reverts `Error::NotOfficer` (2) |

The generated `try_` client surfaces a `panic_with_error!` as `soroban_sdk::Error`, so tests assert via `Error::from_contract_error(code)`.

### 7.3 The AI + chain-ops backend — `services/ai/src/index.ts`

A small Express 5 server that is both the AI treasurer and a thin chain-ops backend, so the `OPENAI_API_KEY` and the CLI identities never ship to the client.

| Method / route | Purpose |
|---|---|
| `GET /health` | `{ ok, model, hasKey }` |
| `POST /rules { text }` | OpenAI (`gpt-4o-mini`, `json_object` mode, temp 0) → policy `{ currency, dues, categories[], approval{threshold, of}, summary }`, validated by a zod schema |
| `POST /ask { question, state }` | OpenAI grounded Q&A over passed-in chain state; warm, plain-language, pesos, 2-4 sentences |
| `GET /config` | public chain config `{ network, usdcSac, usdcIssuer, rpcUrl, passphrase, friendbotUrl, categories, limits, threshold, configured }` |
| `POST /faucet { address, amount? }` | mints test USDC to an address via the CLI issuer identity (address must already trust USDC) |
| `POST /pool/create { officers, threshold }` | deploys the treasury wasm + `initialize` via the CLI deployer identity → `{ contractId }` |

Chain ops run through a `stellar()` helper that `execFile`s the Stellar CLI and strips `SOROBAN_RPC_URL` / passphrase env vars so `--network testnet` is authoritative. **No secrets in code, env, transcript, or bundle:** issuer and deployer identities live in the local CLI keystore; the AI never holds keys.

### 7.4 The client — `apps/web`

Vite + React 19 PWA, mobile-first. In-browser officer personas (Kap. Ramon, Aling Nena, Kuya Jun) hold testnet keypairs in `localStorage` and sign client-side via `basicNodeSigner` — secrets never leave the device. TanStack Router (code-based, type-safe) + TanStack Query drive all chain/AI reads. Screens: **Home** (balance hero, live on-chain card, Ask-the-Treasurer box, category budgets, activity), **Contribute**, **Spend** (per-officer approval chips + a Release button gated on the threshold), **Setup** (AI rules parse + officers). A live on-chain card refetches every 15s.

### 7.5 Stack & versions (verified against the manifests)

| Layer | Choice / version |
|---|---|
| Contract | Rust, `soroban-sdk` 26, Stellar CLI 27, `wasm32v1-none`, Testnet |
| Release profile | `opt-level = "z"`, `lto`, `panic = "abort"`, `codegen-units = 1`, `strip = "symbols"` |
| Web build | Vite `^8.1.4`, React `^19.2.7`, TypeScript `^7.0.2`, `@tailwindcss/vite` `^4.3.2`, `vite-plugin-pwa`, `vite-plugin-node-polyfills` |
| Routing / data | TanStack Router `^1.170.17`, TanStack Query `^5.101.2` |
| Chain client | `@stellar/stellar-sdk` `^16.0.1`, `@stellar/freighter-api` `^6.0.1` |
| Backend | Node + Express `^5.2.1`, OpenAI SDK `^6.45.0` (default `gpt-4o-mini`), zod `^4.4.3`, cors, dotenv, tsx |
| Package mgr | pnpm workspaces (`pnpm@11.9.0`), Node ≥ 20 |
| Mobile | PWA now; Capacitor-ready static build as a stretch |

**Currency convention:** the group thinks in pesos (1 USDC ≈ ₱1 for the demo), but settlement is USDC on-chain. The USDC SAC has 7 decimals, so `raw = human × 10,000,000` (`SCALE = 1e7`). Dues ₱200 → `2,000,000,000` raw; the 20,000 seed → `200,000,000,000` raw; Equipment cap ₱5,000 → `50,000,000,000` raw.

---

## 8. Hackathon context — APAC Stellar Hackathon 2026

| Milestone | Date |
|---|---|
| Launch | May 14, 2026 |
| Submissions open | Jun 15, 2026 |
| **Final submission deadline** | **Jul 15, 2026** |
| Demo Day | Jul 18, 2026 |
| Grand Finale | Jul 24, 2026 |

- **Prize pool:** up to **$60,000 USD**.
- **Regions:** Vietnam, Indonesia, Philippines, plus online APAC.
- **What judges reward:** user-facing financial apps with **real utility**, **local anchors / assets**, and **composability** (wallets, DeFi, on/off-ramps).

**How Kolektibo maps to the judging steer:**

| Judges reward | Kolektibo delivers |
|---|---|
| Real utility, user-facing | A treasury a non-crypto barangay committee can actually run from a phone |
| Local anchors / assets | Settles in **USDC** (as a testnet SAC); GCash-native, pesos-first framing |
| Composability | Idle-fund yield and a SEP-24 on/off-ramp are natural next hops; the contract is the shared, composable state layer |

This overview was authored on **2026-07-11** (~01:46 MPST), roughly **four days** before the final submission deadline.

---

## 9. Live on Stellar Testnet

All trust-critical state lives on-chain — **the blockchain is the database.** There is no off-chain DB for anything with authority over money; `localStorage` holds only client wallet state, and the backend is stateless.

| What | Contract ID / hash |
|---|---|
| Canonical treasury (with `get_categories`/`get_spends`, scaled limits, seeded 20,000 USDC) | `CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2` |
| First treasury (multisig proof) | `CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR` |
| Test USDC (Stellar Asset Contract) | `CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR` |
| USDC issuer (classic) | `GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM` |

**The whole thesis, proven on-chain.** Policy: 2-of-3 officers; Equipment / Venue / Refreshments caps; treasury seeded with 20,000 test USDC.

1. `request_spend` → spend #1 created, proposer auto-approved (1 approval).
2. `execute` with 1 approval → **reverted `Error(Contract, #6)` NotEnoughApprovals** — one officer cannot drain the fund.
3. A second officer `approve` → 2 approvals; a duplicate approval → **reverted `Error(Contract, #7)` AlreadyApproved**.
4. `execute` with 2-of-3 → **real USDC `transfer`**, treasury → recipient, 1000 raw units.
   Proof tx: `127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278`
5. Balances confirmed on-chain: treasury `200000000000 → 199999999000`, recipient `0 → 1000`.

Explorer base: `https://stellar.expert/explorer/testnet/` (`contract/<id>`, `tx/<hash>`, `account/<pk>`).

---

## 10. Current status

**The core product is complete and verified end-to-end on Stellar testnet.** The Soroban treasury is written, passes 4/4 tests, is deployed, and has demonstrated the full multisig USDC release on-chain (single officer blocked, duplicate approval blocked, non-officer proposal blocked, over-limit rejected). The read path is verified via a Node smoke test through the generated TypeScript bindings (live balance 20,000 USDC, threshold 2, scaled category caps), and the write path is verified end-to-end via a second smoke test that creates a pool through the backend, funds and trustlines the personas, faucets USDC, contributes, requests a spend, approves to 2-of-3, and executes — proving the browser architecture (in-browser officer keys + client-side signing) works on testnet. The AI service (`/rules`, `/ask`) runs, and the create-your-own-pool onboarding deploys a fresh treasury per group. Remaining work is presentation and polish, not core function: browser QA by the team, the pitch deck and demo script, UI/UX polish and a demo video, the submission package, and optional stretch items (transparent yield via Blend, a SEP-24 anchor for on/off-ramp, multi-device support with a minimal off-chain directory, and a Capacitor build).
