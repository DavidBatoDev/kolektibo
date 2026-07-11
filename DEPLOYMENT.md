# Deployment — Stellar Testnet

Live, verified deployment of the Kolektibo treasury.

## Contracts

Two treasury instances exist on testnet (both 2-of-3, same USDC SAC + issuer). The **canonical**
treasury is the one the web app runs against — its ID is baked into the generated TS bindings and
written to `apps/web/.env.local` (`VITE_TREASURY_CONTRACT_ID`). The **first** treasury is the
original proof-of-concept and is the subject of the multisig-release proof tx below.

| What | Contract ID |
|---|---|
| **Treasury — canonical** (the demo runs against this; seeded 20,000 USDC) | `CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2` |
| Treasury — first (multisig-release proof) | `CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR` |
| Test USDC (Stellar Asset Contract) | `CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR` |
| USDC issuer (classic) | `GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM` |

Explorer (canonical): https://stellar.expert/explorer/testnet/contract/CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2

> `scripts/deploy.sh` writes these IDs to `apps/web/.env.local`; re-running it deploys a **fresh**
> instance with a new ID (which is how the two instances above came to exist). For the submission the
> canonical ID above is authoritative and matches the bindings + `.env.local`.

Canonical state **verified on-chain (read-only) on 2026-07-11**: `get_threshold` = **2**,
`get_officers` = **3**, `get_balance` = **200000000000** (20,000 USDC), `get_categories` = Equipment
5,000 / Venue 3,000 / Refreshments 1,500 (raw ×1e7). Full artifact list + explorer links:
[`docs/06-deployment-and-onchain-proof`](./docs/06-deployment-and-onchain-proof_2026-07-11_0146.md).

## Verified end-to-end (the whole thesis, on-chain)

The multisig-release proof below was executed against the **first treasury** (`CBPAYE…3JLR`); the
canonical treasury is the **identically configured** live instance the app uses (2-of-3, same caps,
seeded 20,000 USDC — verified above). Policy: 2-of-3 officers; Equipment/Venue/Refreshments caps.

1. `request_spend` → spend #1 created, proposer auto-approved (1 approval).
2. `execute` with 1 approval → **reverted `Error(Contract, #6)` NotEnoughApprovals**. The fund cannot be drained by one officer.
3. second officer `approve` → 2 approvals. A duplicate approval → **reverted `Error(Contract, #7)` AlreadyApproved**.
4. `execute` with 2-of-3 → **real USDC `transfer` event**, treasury → recipient, 1000 raw units.
   Proof: https://stellar.expert/explorer/testnet/tx/127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278
5. Balances confirmed on-chain: first treasury `200000000000 → 199999999000`, recipient `0 → 1000`.

## Two things the app must handle (learned during deploy)

### 1. Units — everything on-chain is raw token units
The USDC SAC has **7 decimals**. `1 USDC = 10,000,000 raw`. The contract is unit-agnostic and
stores raw `i128`. Convention for the whole app + deploy:

```
raw = humanAmount * 10_000_000        // SCALE = 1e7
```

For the demo we treat **1 USDC ≈ ₱1**. So dues ₱200 → 2,000,000,000 raw; the treasury seed of
20,000 → 200,000,000,000 raw; Equipment cap ₱5,000 → 50,000,000,000 raw. The frontend formats
raw → ₱ for display and multiplies by SCALE for any contract call.

### 2. Trustlines — recipients/members must trust the asset first
Classic Stellar assets (including real Circle USDC) require an account to establish a
**trustline** before it can hold the asset. Contracts are exempt (that's why minting into the
treasury worked, but the first transfer to a fresh account failed until we added the trustline
via `change-trust`). App onboarding will:
- create a trustline for each member's in-app account when they join, and
- create one for a payee before the first disbursement to them.

A real on/off-ramp (SEP-24 anchor) does this automatically — which is exactly the composability story.

---

## Not in demo scope — Paluwagan (post-hackathon spike)

Paluwagan (rotating ROSCA) is **descoped from the hackathon demo** to keep the demo focused on a
single idea — the AI-governed treasury. See
[Decision Record — Descope Paluwagan](./docs/decision-descope-paluwagan_2026-07-11_1345.md).
The verified contract stays in the repo as a post-hackathon (roadmap Phase 3) spike and is **not
part of the demo loop**:

| What | Contract ID |
|---|---|
| Paluwagan (rotating ROSCA) | `CBX7WXQ5STPXPR2K3YFEBMPLMMDFBEIVPUVJTTPBSVJNWBG5WVGIL4SW` |

6/6 unit tests pass; a full 3-cycle rotation was executed on testnet via
`scripts/paluwagan-testnet.sh` — the pot rotated to each member in order, ending zero-sum (every
member back to their starting balance, contract at 0). Kept as proof the trust engine generalizes.
