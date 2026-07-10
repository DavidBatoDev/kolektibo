# Deployment & On-Chain Proof
_Created: 2026-07-11 01:46 MPST · Kolektibo · Stellar Testnet_

Kolektibo's entire thesis — _no single officer and not the AI can drain a group's money_ — is not a claim in a slide deck. It is enforced by a Soroban contract that is live on Stellar Testnet, and every trust guarantee has been exercised on-chain. This document is the evidence file: it lists the deployed artifacts with explorer links, walks through the multisig-release proof transaction, documents the exact deploy flow, records the two operational lessons that shaped the app (units and trustlines), and reproduces the full end-to-end verification results (Rust unit tests, a read-path smoke test, and a write-path smoke test that runs `create → contribute → request → approve → execute` against live testnet).

Everything below runs on **Stellar Testnet**. The pooled asset is **USDC represented as a Stellar Asset Contract (SAC)**; identities are funded via Friendbot; there is no mainnet component and no production custody.

---

## 1. Deployed testnet artifacts

Two treasury instances exist on testnet. The **canonical** treasury is the one the web app and the read smoke test point at (it carries the final view set — `get_categories`/`get_spends` — and is seeded with 20,000 test USDC). The **first** treasury is the original multisig proof-of-concept and is the subject of the proof transaction in [Section 2](#2-proof-of-multisig-the-execute-transaction). Both are backed by the same test USDC SAC and the same classic USDC issuer.

| Artifact | Type | ID | Explorer |
|---|---|---|---|
| **Canonical treasury** | Soroban contract | `CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2` | [contract ↗](https://stellar.expert/explorer/testnet/contract/CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2) |
| **First treasury** (multisig proof) | Soroban contract | `CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR` | [contract ↗](https://stellar.expert/explorer/testnet/contract/CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR) |
| **Test USDC** | Stellar Asset Contract (SAC) | `CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR` | [contract ↗](https://stellar.expert/explorer/testnet/contract/CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR) |
| **USDC issuer** | Classic Stellar account | `GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM` | [account ↗](https://stellar.expert/explorer/testnet/account/GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM) |

The canonical treasury ID is baked into the generated TypeScript bindings and is the source of truth for the front end:

```ts
// apps/web/src/contract/treasury/src/index.ts
export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2",
  }
} as const
```

> The USDC asset is `USDC:GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM`. The Asset→SAC contract ID is deterministic, so the SAC (`CDTC…QR`) is deployed once and reused by every treasury.

### Network endpoints

| Setting | Value |
|---|---|
| Network passphrase | `Test SDF Network ; September 2015` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Horizon | `https://horizon-testnet.stellar.org` |
| Friendbot | `https://friendbot.stellar.org` |
| Explorer base | `https://stellar.expert/explorer/testnet/` (`contract/<id>`, `tx/<hash>`, `account/<pk>`) |

---

## 2. Proof-of-multisig: the `execute` transaction

The moat is not the AI. It is that money only moves when the on-chain policy is satisfied. The following sequence was run against the **first treasury** (`CBPAYE…3JLR`), configured **2-of-3 officers** with Equipment/Venue/Refreshments category caps and seeded with 20,000 test USDC (`200000000000` raw). It demonstrates every failure mode plus the one success path.

```
                    First treasury  CBPAYE…3JLR   (policy: 2-of-3)
                    seeded balance = 200000000000 raw  (20,000 USDC)
   ┌───────────────────────────────────────────────────────────────────┐
   │ 1  request_spend  →  spend #1 created, proposer auto-approved       │
   │                      approvals = 1                                  │
   │                                                                     │
   │ 2  execute  (1 approval)     ✗ REVERT  Error(Contract, #6)          │
   │                                        NotEnoughApprovals           │
   │        └─ one officer alone CANNOT drain the fund                   │
   │                                                                     │
   │ 3  approve  (2nd officer)    →  approvals = 2                       │
   │    approve  (duplicate)      ✗ REVERT  Error(Contract, #7)          │
   │                                        AlreadyApproved              │
   │                                                                     │
   │ 4  execute  (2-of-3 met)     ✓ real USDC transfer event            │
   │        treasury → recipient, 1000 raw units                        │
   │        tx 127e4e3f…31278                                            │
   │                                                                     │
   │ 5  balances confirmed on-chain:                                     │
   │        treasury  200000000000 → 199999999000                       │
   │        recipient          0   →         1000                       │
   └───────────────────────────────────────────────────────────────────┘
```

**Proof transaction hash:**

```
127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278
```

[View on stellar.expert ↗](https://stellar.expert/explorer/testnet/tx/127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278)

### What each step proves

| # | Action | Contract result | Guarantee demonstrated |
|---|---|---|---|
| 1 | `request_spend` by an officer | Spend #1 created; proposer's approval auto-recorded (1 approval) | Proposing counts as one approval, not authorization to release |
| 2 | `execute` with only 1 approval | Revert `Error(Contract, #6)` **NotEnoughApprovals** | **A single officer cannot release funds** — the core trust claim |
| 3a | 2nd officer `approve` | Approvals = 2 (threshold met) | Approvals accumulate on-chain and are attributable |
| 3b | Duplicate `approve` | Revert `Error(Contract, #7)` **AlreadyApproved** | One officer cannot fake quorum by approving twice |
| 4 | `execute` with 2-of-3 | Real USDC `transfer` event; 1000 raw units treasury → recipient | Release happens **only after** policy is satisfied — and is permissionless once it is |
| 5 | On-chain balance read | treasury `200000000000 → 199999999000`; recipient `0 → 1000` | The state change is real and publicly auditable |

The write smoke test in [Section 5.3](#53-write-path-smoke-test-full-e2e) independently re-proves the happy path on a freshly deployed pool, moving a full **300 USDC** end to end.

---

## 3. The deploy flow (`scripts/deploy.sh`)

One command deploys a fresh treasury, wires up the test USDC, applies the policy, seeds funds, and writes the front-end env file:

```bash
pnpm contract:deploy      # → bash scripts/deploy.sh
```

`scripts/deploy.sh` is idempotent-friendly (it tolerates already-funded identities and an already-deployed SAC) and self-locating (paths resolve relative to the script). It uses the local **Stellar CLI** keystore identities `kolektibo-deployer`, `kolektibo-officer2`, `kolektibo-officer3`, and `kolektibo-usdc-issuer` — **no secret keys ever appear in code, env files, or the transcript.**

### The six steps

```
scripts/deploy.sh
├─ 1/6  Ensure funded deployer + officer identities
│        for name in kolektibo-{deployer,officer2,officer3,usdc-issuer}:
│          stellar keys generate <name> --network testnet --fund   (or keys fund)
│        DEPLOYER / OFFICER2 / OFFICER3 / ISSUER = stellar keys address <name>
│
├─ 2/6  Build the contract wasm
│        stellar contract build --manifest-path contracts/treasury/Cargo.toml
│        WASM = contracts/target/wasm32v1-none/release/treasury.wasm
│               (fallback: wasm32-unknown-unknown/release/treasury.wasm)
│
├─ 3/6  Ensure test USDC exists as a SAC   (deterministic id — deploy once, reuse)
│        stellar contract asset deploy --asset USDC:$ISSUER --source kolektibo-usdc-issuer
│        USDC_SAC = stellar contract id asset --asset USDC:$ISSUER --network testnet
│
├─ 4/6  Deploy the treasury contract
│        TREASURY_ID = stellar contract deploy --wasm $WASM --source kolektibo-deployer
│
├─ 5/6  Initialize policy + seed funds
│        stellar contract invoke --id $TREASURY_ID --source kolektibo-deployer -- initialize \
│          --token      $USDC_SAC \
│          --officers   ["$DEPLOYER","$OFFICER2","$OFFICER3"] \
│          --threshold  2 \
│          --categories ["Equipment","Venue","Refreshments"] \
│          --limits     ["50000000000","30000000000","15000000000"]   # 5000/3000/1500 × 1e7
│        # seed the treasury so execute() can make a real transfer in the demo
│        stellar contract invoke --id $USDC_SAC --source kolektibo-usdc-issuer -- \
│          mint --to $TREASURY_ID --amount 200000000000                 # 20000 × 1e7
│
└─ 6/6  Write apps/web/.env.local
         VITE_AI_URL=http://localhost:8787
         VITE_HORIZON_URL=https://horizon-testnet.stellar.org
         VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
         VITE_TREASURY_CONTRACT_ID=$TREASURY_ID
         VITE_USDC_SAC_ID=$USDC_SAC
```

### The applied policy

The deploy script initializes the treasury with exactly this policy:

| Parameter | Value |
|---|---|
| Approval rule | **2-of-3 officers** (`--threshold 2`, 3 officers) |
| Officers | `kolektibo-deployer`, `kolektibo-officer2`, `kolektibo-officer3` addresses |
| Token | The test USDC SAC (`--token $USDC_SAC`) |
| Categories & per-spend caps | Equipment ≤ 5,000 · Venue ≤ 3,000 · Refreshments ≤ 1,500 USDC |
| Raw limits (scaled ×1e7) | `50000000000` / `30000000000` / `15000000000` |
| Seed | 20,000 USDC minted into the treasury (`200000000000` raw) |

`initialize` is a one-time call; a second call reverts with `Error(Contract, #1)` **AlreadyInitialized**. It also validates the policy up front: `threshold` must be `> 0` and `<= officers.len()`, and `categories.len()` must equal `limits.len()`, otherwise it reverts with `Error(Contract, #8)` **InvalidInit**.

### `initialize` signature (contract)

```rust
// contracts/treasury/src/lib.rs
pub fn initialize(
    env: Env,
    token: Address,
    officers: Vec<Address>,
    threshold: u32,
    categories: Vec<Symbol>,
    limits: Vec<i128>,
)
```

### PATH helper (`scripts/env.sh`)

`deploy.sh` sources `scripts/env.sh`, which prepends the Cargo bin and Stellar CLI directories to `PATH` so a stale shell session can still find the toolchain:

```bash
export PATH="/c/Users/huawei/.cargo/bin:/c/Program Files (x86)/Stellar CLI:$PATH"
```

You can source it directly before running any `cargo` / `stellar` command:

```bash
source scripts/env.sh
```

### Toolchain versions used

| Component | Version |
|---|---|
| Rust | 1.97.0 |
| `soroban-sdk` | 26 (26.1.0) |
| Stellar CLI | 27.0.0 |
| Wasm target | `wasm32v1-none` |
| Node | ≥ 20 (project uses 22) |
| pnpm | 11 (`pnpm@11.9.0`) |

The release build profile is size-optimized (`contracts/Cargo.toml`): `opt-level = "z"`, `lto = true`, `panic = "abort"`, `codegen-units = 1`, `strip = "symbols"`, plus `overflow-checks = true`.

---

## 4. Two operational lessons baked into the app

Two facts about Stellar assets shaped the entire client architecture. Both were learned during deploy and are now handled automatically by the app and the deploy script.

### 4.1 Units — everything on-chain is raw token units

The USDC SAC has **7 decimals**, so `1 USDC = 10,000,000 raw`. The contract itself is unit-agnostic — it stores plain `i128` — so the whole system adopts a single convention:

```
raw = humanAmount × 10_000_000        // SCALE = 1e7
```

For the demo the group thinks in pesos and we treat **1 USDC ≈ ₱1**. Every amount therefore has a raw form:

| Human value | Meaning | Raw (`× 1e7`) |
|---|---|---|
| ₱200 | monthly dues per member | `2000000000` |
| ₱1,500 | Refreshments cap | `15000000000` |
| ₱3,000 | Venue cap | `30000000000` |
| ₱5,000 | Equipment cap | `50000000000` |
| 20,000 | treasury seed | `200000000000` |

The front end multiplies by `SCALE` before any contract call and formats `raw → ₱` for display; the deploy script and both smoke tests use the same `1e7` scale factor.

### 4.2 Trustlines — recipients must trust the asset first

Classic Stellar assets (including real Circle USDC) require an account to establish a **trustline** (`change_trust`) before it can hold the asset. **Contracts are exempt** — which is exactly why minting 20,000 USDC _into_ the treasury contract worked immediately, but the first `transfer` to a fresh recipient account failed until a trustline was added.

Consequences, now built into onboarding:

- The app creates a USDC trustline for each member's in-app account when they join.
- The app creates a trustline for a payee before the first disbursement to them.
- A real SEP-24 on/off-ramp anchor would do this automatically — which is precisely the composability story Kolektibo wants to tell.

```
mint  USDC ──▶ [ treasury contract ]     ✓ works  (contracts need no trustline)
transfer USDC ──▶ [ fresh G… account ]   ✗ fails until change_trust(USDC:GBYFI…)
```

---

## 5. Full end-to-end verification

Three independent verification layers all pass: Rust unit tests (the contract logic in isolation), a read-path smoke test (bindings can read live testnet state), and a write-path smoke test (the exact browser primitives drive a real pool from creation through release).

### 5.1 Contract unit tests — 4/4 PASS

Source: `contracts/treasury/src/test.rs`. Run:

```bash
cd contracts && cargo test        # (source scripts/env.sh first if PATH is stale)
```

The test harness sets up a `register_stellar_asset_contract_v2` USDC-like SAC, 3 officers, a plain member, and a vendor, then `initialize`s the treasury **2-of-3** with categories Equipment (cap 5,000) and Venue (cap 3,000).

| Test | What it exercises | Assertion |
|---|---|---|
| `full_happy_path` | contribute 2,000 → `request_spend` Equipment 1,200 (auto-approve) → officer 1 `approve` (2-of-3) → `execute` | vendor balance = 1,200; treasury = 800; `get_spend(id).executed == true` |
| `cannot_execute_without_threshold` | `execute` with only the proposer's 1 approval | `try_execute` returns `Err(Error #6 NotEnoughApprovals)`; vendor balance = 0 |
| `rejects_over_category_limit` | `request_spend` Equipment 6,000 against a 5,000 cap | `try_request_spend` returns `Err(Error #3 OverCategoryLimit)` |
| `non_officer_cannot_propose` | a plain member calls `request_spend` | `try_request_spend` returns `Err(Error #2 NotOfficer)` |

> Assertions on reverts use the generated `try_` client, which surfaces a `panic_with_error!` as a `soroban_sdk::Error`; the tests compare against `soroban_sdk::Error::from_contract_error(code)`.

### 5.2 Read-path smoke test

Source: `apps/web/scripts/smoke.mts`. It uses the generated bindings `Client` to read live state from the **canonical** treasury over Soroban RPC:

```ts
const client = new Client({
  contractId: networks.testnet.contractId,          // CBR36Q2…INF2
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: 'https://soroban-testnet.stellar.org',
})
// reads: get_balance, get_threshold, get_officers, get_categories, get_members, get_spends
```

**Result:** balance `200000000000n` raw (= 20,000 USDC), threshold `2`, the three officer addresses, and the scaled category caps — confirming the bindings and the deployed state agree.

### 5.3 Write-path smoke test — full E2E

Source: `apps/web/scripts/smoke-write.mts`. This is the strongest proof that the **browser architecture works**: it deliberately uses the same primitives the web app uses — the generated bindings `Client` plus `basicNodeSigner` for client-side signing — and drives a brand-new pool through the entire loop against live testnet. The local AI/chain-ops backend (`http://localhost:8787`) must be running, since pool creation and the USDC faucet go through it.

```
smoke-write.mts  (create → contribute → request → approve → execute)

 1) fund + trustlines   3 random officers + 1 payee → Friendbot, then change_trust(USDC)
 2) deploy pool         POST /pool/create { officers:[3 pubkeys], threshold: 2 }  → contractId
 3) faucet USDC         POST /faucet { address } for each officer
 4) contribute 600      officer0 signs client-side (basicNodeSigner) → contribute(600 × 1e7)
 5) request_spend 300   officer0 → request_spend Equipment 300, recipient = payee, "game balls"
 6) approve             officer1 → approve(spend_id)      → 2-of-3 met
 7) execute             officer0 → execute(spend_id)      → 300 USDC released to payee
 ─────────────────────────────────────────────────────────────────────────────
    RESULT  pool balance = 300 USDC   (600 in − 300 out)
            payee USDC   = 300
    ✅ PASS  (balance === 300n × 1e7  &&  payee USDC === 300)
```

**Result:** pool balance `300 USDC` (600 contributed − 300 released) and the payee received `300 USDC` — the script prints `✅ PASS`. This proves that in-browser officer keypairs signing client-side via `basicNodeSigner`, combined with a stateless backend that only performs deploy/init/faucet from CLI-keystore identities, produce a correct end-to-end multisig treasury on testnet. No secret key is ever materialized in the bundle, env, or transcript.

### Verification summary

| Layer | Harness | Scope | Result |
|---|---|---|---|
| Contract logic | `cargo test` (`test.rs`) | happy path + 3 revert paths | **4/4 PASS** |
| Read path | `apps/web/scripts/smoke.mts` | live reads via bindings (canonical treasury) | **PASS** — 20,000 USDC, 2-of-3 |
| Write path | `apps/web/scripts/smoke-write.mts` | create→contribute→request→approve→execute | **PASS** — 300 USDC moved E2E |
| On-chain multisig | tx `127e4e3f…31278` | real USDC release after 2-of-3 (first treasury) | **PASS** — explorer-verifiable |

---

## 6. How to redeploy

A redeploy produces a **fresh** treasury with a **new** contract ID. Nothing about the old instance is mutated; the blockchain keeps the old one forever, and `deploy.sh` simply overwrites `apps/web/.env.local` to point the front end at the new one.

### Prerequisites

- Rust 1.97.0 + Stellar CLI 27.0.0 on `PATH` (`source scripts/env.sh` handles this on the build machine).
- The wasm target: `rustup target add wasm32v1-none`.
- Local Stellar CLI keystore identities are created and funded automatically by step 1 of the script.

### Run it

```bash
# from the repo root
pnpm contract:deploy
#   └─ bash scripts/deploy.sh
```

On success the script prints the new IDs and an explorer link, e.g.:

```
✅ Deployed.
   Treasury : C…                      (new id)
   USDC SAC : CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR   (reused)
   Explorer : https://stellar.expert/explorer/testnet/contract/C…
```

### What changes vs. what is reused

| Reused across redeploys | New each redeploy |
|---|---|
| USDC issuer account (`GBYFI…55HM`) | Treasury contract ID |
| USDC SAC (`CDTC…QR`, deterministic) | `apps/web/.env.local` `VITE_TREASURY_CONTRACT_ID` |
| CLI keystore identities (deployer/officers/issuer) | The seeded 20,000 USDC (minted into the new treasury) |

### After redeploy

1. `apps/web/.env.local` is rewritten automatically (step 6). Restart the Vite dev server so `VITE_TREASURY_CONTRACT_ID` / `VITE_USDC_SAC_ID` are picked up.
2. If you want the read smoke test and generated bindings (`networks.testnet.contractId` in `apps/web/src/contract/treasury/src/index.ts`) to target the new instance, regenerate/point them at the new ID — otherwise they keep reading the canonical treasury.
3. The write smoke test (`smoke-write.mts`) always creates its own fresh pool via the backend, so it needs no changes.

### Front-end env reference

Copy `apps/web/.env.example` to `apps/web/.env.local`; all values are optional with sensible testnet defaults, and the two contract IDs are filled in by the deploy script:

```bash
VITE_AI_URL=http://localhost:8787
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_TREASURY_CONTRACT_ID=      # filled by scripts/deploy.sh
VITE_USDC_SAC_ID=               # filled by scripts/deploy.sh
```

---

## Appendix A — Contract error codes

Every revert seen in the proofs above maps to a `contracterror` value (`repr(u32)`) in `contracts/treasury/src/lib.rs`. These are what stellar.expert and the generated bindings surface as `Error(Contract, #n)`.

| # | Name | Raised when |
|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` called a second time |
| 2 | `NotOfficer` | non-officer calls `request_spend` / `approve` |
| 3 | `OverCategoryLimit` | requested amount exceeds the category's cap |
| 4 | `SpendNotFound` | `approve` / `execute` on an unknown spend id |
| 5 | `AlreadyExecuted` | `approve` / `execute` on an already-released spend |
| 6 | `NotEnoughApprovals` | `execute` before the approval threshold is met |
| 7 | `AlreadyApproved` | an officer approves the same spend twice |
| 8 | `InvalidInit` | bad `initialize` args (threshold/lengths) |
| 9 | `InsufficientBalance` | `execute` when the treasury can't cover the amount |
| 10 | `NonPositiveAmount` | `contribute` / `request_spend` with amount ≤ 0 |

## Appendix B — Contract function signatures (Testnet ABI)

```rust
// State-changing
initialize(token: Address, officers: Vec<Address>, threshold: u32,
           categories: Vec<Symbol>, limits: Vec<i128>)
contribute(from: Address, amount: i128)                          // from.require_auth()
request_spend(proposer: Address, category: Symbol, amount: i128,
              recipient: Address, memo: String) -> u32           // proposer.require_auth(); officer-only
approve(officer: Address, spend_id: u32)                         // officer.require_auth(); officer-only
execute(spend_id: u32)                                           // PERMISSIONLESS; reverts unless approvals >= threshold

// Read-only views
get_balance() -> i128
get_spend(id: u32) -> Option<SpendRequest>
get_spends() -> Vec<SpendRequest>
get_categories() -> Vec<CategoryInfo>
get_officers() -> Vec<Address>
get_threshold() -> u32
get_members() -> Vec<Address>
get_contribution(who: Address) -> i128
get_next_spend_id() -> u32
```

Events published (`env.events().publish`): `contrib`, `spend_req`, `approve`, `execute`. Under soroban-sdk 26 the publish call emits a harmless deprecation warning.
