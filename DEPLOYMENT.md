# Deployment — Stellar Testnet

Live, verified deployment of the Kolektibo treasury.

## Contracts

| What | Contract ID |
|---|---|
| Treasury | `CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR` |
| Test USDC (Stellar Asset Contract) | `CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR` |
| USDC issuer (classic) | `GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM` |

Explorer: https://stellar.expert/explorer/testnet/contract/CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR

> These IDs are written to `apps/web/.env.local` by `scripts/deploy.sh`. Re-running the
> script deploys a fresh instance with new IDs.

## Verified end-to-end (the whole thesis, on-chain)

Policy: 2-of-3 officers; Equipment/Venue/Refreshments category caps. Treasury seeded with 20,000 test USDC.

1. `request_spend` → spend #1 created, proposer auto-approved (1 approval).
2. `execute` with 1 approval → **reverted `Error(Contract, #6)` NotEnoughApprovals**. The fund cannot be drained by one officer.
3. second officer `approve` → 2 approvals. A duplicate approval → **reverted `Error(Contract, #7)` AlreadyApproved**.
4. `execute` with 2-of-3 → **real USDC `transfer` event**, treasury → recipient, 1000 raw units.
   Proof: https://stellar.expert/explorer/testnet/tx/127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278
5. Balances confirmed on-chain: treasury `200000000000 → 199999999000`, recipient `0 → 1000`.

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
