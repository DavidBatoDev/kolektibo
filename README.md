# Kolektibo

**AI-Governed Group Treasury on Stellar.**

Filipinos constantly pool money together — barangay projects, church collections, co-op
capital, class and reunion funds, team _pondohan_ — but manage it with a notebook and blind
trust in one treasurer. Kolektibo replaces the notebook and the single point of failure with
an **AI treasurer** whose every move is enforced by a **Soroban smart contract**: it can only
execute what the group's on-chain policy allows, and no single person — not even the AI — can
drain the fund.

Built for the **APAC Stellar Hackathon 2026**.

> **Status: built & verified on Stellar Testnet.** The whole loop works today — create a pool,
> contribute USDC, request a spend, gather 2-of-3 officer approvals, release USDC, and ask the AI
> where the money went. The contract is deployed (4/4 unit tests pass) and the end-to-end flow is
> verified by Node smoke tests **and** a live Playwright walkthrough. Built in a single session
> (see [`docs/07-progress-log`](./docs/07-progress-log_2026-07-11_0146.md)).

## Monorepo layout

```
contracts/            Rust workspace — the Soroban treasury contract (policy + M-of-N approvals) + tests
apps/web/             Capacitor-ready PWA (Vite · React · TanStack Router/Query · Tailwind) + generated contract bindings
services/ai/          Node + Express — AI treasurer (OpenAI) AND chain-ops backend (deploy / faucet via the Stellar CLI)
scripts/              Testnet deploy + toolchain env helpers
docs/                 Full timestamped documentation set + QA report
```

- **How it works & why:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Deep docs (11 topics + QA report):** [`docs/`](./docs) → start at [`docs/00-INDEX`](./docs/00-INDEX_2026-07-11_0146.md)
- **Live contract IDs + on-chain proof:** [DEPLOYMENT.md](./DEPLOYMENT.md)

## Prerequisites

- **Node ≥ 20, pnpm ≥ 11** — for the web app and backend
- **Rust + Stellar CLI** — for building/deploying the contract: `winget install Rustlang.Rustup Stellar.StellarCLI`
- An **`OPENAI_API_KEY`** — for the AI treasurer (`services/ai`)

## Getting started

```bash
pnpm install

# Backend config: add your OpenAI key (chain settings are pre-filled for testnet)
cp services/ai/.env.example services/ai/.env    # then set OPENAI_API_KEY

pnpm dev                                          # web → :5173   ·   ai + chain-ops → :8787
```

Open **http://localhost:5173** and run the demo:

1. **Deploy on Stellar testnet** — creates a fresh treasury with 3 in-browser officer personas and seeds it (~1 min).
2. **Contribute** — add USDC as a member (signed in-browser, confirmed on-chain).
3. **Spend** — request a spend, tap two of the three officers to approve; the **Release** button only unlocks at 2-of-3, then moves real USDC.
4. **Ask** the AI treasurer "where did the money go?" — the answer is grounded in on-chain history.

Every action links to the transaction on [stellar.expert](https://stellar.expert/explorer/testnet).
Full walkthrough + troubleshooting: [`docs/09-how-to-run`](./docs/09-how-to-run_2026-07-11_0146.md).

### Contract

```bash
cargo test --manifest-path contracts/treasury/Cargo.toml   # 4/4 unit tests
pnpm contract:build                                        # build the wasm
pnpm contract:deploy                                       # deploy + init on testnet, writes apps/web/.env.local
```

> Windows note: `cargo`/`stellar` may not be on PATH in a fresh shell — `source scripts/env.sh` first.

### Watch it drive itself (optional)

A Playwright MCP server is preconfigured to open a real browser in **slow motion** so you can
watch Claude click through the app. See [`docs/playwright-mcp-guide`](./docs/playwright-mcp-guide_2026-07-11_0220.md).

## Networks

Everything runs on **Stellar Testnet**. Accounts are funded via Friendbot; the pooled asset is
**USDC represented as a Stellar Asset Contract (SAC)**. The group interacts in **₱** while
settlement is USDC on-chain (`raw = ₱ × 1e7`). No mainnet, no real funds.
