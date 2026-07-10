# Kolektibo

**AI-Governed Group Treasury on Stellar.**

Filipinos constantly pool money together — barangay projects, church collections, co-op
capital, class and reunion funds, team _pondohan_ — but manage it with a notebook and blind
trust in one treasurer. Kolektibo replaces the notebook and the single point of failure with
an **AI treasurer** whose every move is enforced by a **Soroban smart contract**: it can only
execute what the group's on-chain policy allows, and no single person can drain the fund.

Built for the **APAC Stellar Hackathon 2026**.

## Monorepo layout

```
contracts/treasury/   Soroban (Rust) contract — holds USDC, enforces policy & M-of-N approvals
apps/web/             Capacitor-ready PWA — Vite + React + TanStack Router/Query + Tailwind
services/ai/          Node + OpenAI SDK — natural-language rules & Q&A over on-chain history
packages/shared/      Shared TypeScript types (policy, pool, spend)
scripts/              Deploy & testnet helpers
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full plan, the demo loop, and the 4-day timeline.

## Prerequisites

- Node ≥ 20, pnpm ≥ 11
- Rust + Stellar CLI (`winget install Rustlang.Rustup Stellar.StellarCLI`)
- An `OPENAI_API_KEY` (for `services/ai`)

## Getting started

```bash
pnpm install
cp services/ai/.env.example services/ai/.env   # add your OPENAI_API_KEY
pnpm dev                                         # runs web + ai together
```

## Networks

Everything runs on **Stellar Testnet**. Identities are funded via Friendbot; the pooled asset
is **USDC represented as a Stellar Asset Contract (SAC)** on testnet.
