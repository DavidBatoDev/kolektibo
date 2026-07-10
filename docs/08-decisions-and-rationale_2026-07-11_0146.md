# Architecture Decisions & Rationale
_Created: 2026-07-11 01:46 MPST · Kolektibo · Stellar Testnet_

This document is the **Architecture Decision Record (ADR) log** for Kolektibo — the AI-Governed Group Treasury on Stellar built for the **APAC Stellar Hackathon 2026**. It exists so the build team and the judges can see not just *what* we built, but *why we built it that way*, *what we rejected*, and *what each choice costs us*.

Every decision below is written in a consistent ADR format:

| Field | Meaning |
|---|---|
| **Decision** | The choice we committed to, stated as a one-liner. |
| **Status** | `Accepted`, `Accepted (stretch deferred)`, or `Superseded`. |
| **Context** | The forces and constraints that made a decision necessary. |
| **Alternatives considered** | The options on the table, and why each did or didn't win. |
| **Rationale** | The reasoning that selected the decision. |
| **Consequences** | What the decision buys us and what it costs us — good and bad. |

The through-line of the whole log is one principle:

> **The blockchain is the authority over money; everything else is interface and labor.** Every decision is judged first by whether it keeps trust-critical state on-chain and enforced, and only second by developer speed, polish, or demo shine.

The design's moat is **steps 5–6 of the demo loop** — the contract collecting M-of-N approvals and *only then* releasing USDC — not the AI. Many of the decisions below exist specifically to protect that moat.

---

## Table of decisions

| # | Decision | Status |
|---|---|---|
| [ADR-001](#adr-001--ai-provider-openai-over-anthropic-claude) | AI provider: OpenAI over Anthropic Claude | Accepted |
| [ADR-002](#adr-002--tanstack-router--query-on-vite-over-tanstack-start) | TanStack Router + Query on Vite over TanStack Start | Accepted |
| [ADR-003](#adr-003--capacitor-ready-pwa-over-a-native-app) | Capacitor-ready PWA over a native app | Accepted (stretch deferred) |
| [ADR-004](#adr-004--real-test-usdc-as-a-sac--faucet-over-native-xlm-zero-secret) | Real test USDC as a SAC + faucet over native XLM zero-secret | Accepted |
| [ADR-005](#adr-005--in-browser-personas--client-side-signing--backend-cli-keystore-the-no-secrets-model) | In-browser personas + client-side signing + backend CLI keystore (the no-secrets model) | Accepted |
| [ADR-006](#adr-006--no-database--the-blockchain-is-the-database) | No database — the blockchain is the database | Accepted |
| [ADR-007](#adr-007--create-your-own-pool-onboarding-one-treasury-per-group) | Create-your-own-pool onboarding (one treasury per group) | Accepted |
| [ADR-008](#adr-008--a-minimal-but-real-soroban-contract-with-panic_with_error) | A minimal-but-real Soroban contract with `panic_with_error` | Accepted |

---

## ADR-001 — AI provider: OpenAI over Anthropic Claude

**Status:** Accepted

### Decision
Use the **OpenAI SDK** (`openai` npm package, `^6.45.0`) with the default model **`gpt-4o-mini`** as the language model behind the AI treasurer, hosted in a thin backend at `services/ai`. The model is configurable via `OPENAI_MODEL`; the API key lives only in `services/ai/.env` as `OPENAI_API_KEY` and never ships to the browser.

### Context
Kolektibo needs an LLM for exactly **two** narrow jobs, both of which are structured and low-risk:

1. **`POST /rules`** — turn a group's plain-language money rules (*"₱200 per member monthly, spends over ₱5k need 2 of 3 officers"*) into a strict JSON policy the officers confirm before it goes on-chain.
2. **`POST /ask`** — answer a member's question (*"how much do we have, and where did it go?"*) in warm, plain language, grounded **only** in the on-chain state the client passes in.

Neither job is the product's moat. The AI never holds keys and never moves money; the contract is the authority. So the provider choice is a matter of developer ergonomics and cost, not trust.

### Alternatives considered

| Option | Verdict |
|---|---|
| **OpenAI `gpt-4o-mini`** (chosen) | Cheap, fast, first-class JSON mode (`response_format: { type: 'json_object' }`), team already had a key and familiarity. |
| **Anthropic Claude** | A strong model and Anthropic is the vendor of this very toolchain — but it was **not** the team's existing integration, and switching bought no capability we needed for two small structured endpoints. |
| **Local / open-weight model** | Rejected: adds infra and latency for zero demo benefit in a 4-day build. |

### Rationale
- **User's explicit choice.** The team chose OpenAI; this ADR records that the choice was deliberate and cost-driven, not accidental.
- **The two endpoints are commodity work.** Both are short prompts with tight output contracts. `gpt-4o-mini` at `temperature: 0` for `/rules` (deterministic policy extraction) and `temperature: 0.2` for `/ask` (a touch of warmth) is more than sufficient.
- **Native JSON mode** removes an entire class of parse-failure bugs. `/rules` requests `json_object` mode and then validates with a **Zod** schema (`^4.4.3`) — belt and suspenders.
- **The output is validated, not trusted.** Whatever the model returns for `/rules` is run through `PolicySchema` (`z.object({ currency, dues, categories[], approval{threshold, of}, summary })`), and the officers confirm the parsed policy before anything is written on-chain. The AI's authority is exactly zero.

```ts
// services/ai/src/index.ts — the model is a labeled dependency, swappable in one line
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const client = apiKey ? new OpenAI({ apiKey }) : null
// /rules → temperature: 0, response_format: { type: 'json_object' } → Zod-validated
// /ask   → temperature: 0.2, grounded on state passed in by the client
```

### Consequences
- **(+)** Fastest path to two working endpoints; JSON mode + Zod makes `/rules` robust.
- **(+)** The provider is a single swappable line (`OPENAI_MODEL`); nothing in the contract, the client, or the trust model depends on it. Migrating to Claude later is a backend-only change.
- **(+)** `hasKey` is surfaced by `GET /health` so a missing key is an obvious, non-fatal degradation rather than a crash.
- **(−)** A cloud dependency and per-call cost, and the AI's answers are only as good as the state the client feeds it (mitigated: the prompt forbids inventing numbers and the state is on-chain truth).
- **(−)** We forgo any Claude-specific strengths — acceptable, because the jobs don't need them.

---

## ADR-002 — TanStack Router + Query on Vite over TanStack Start

**Status:** Accepted

### Decision
Build `apps/web` as a **Vite** SPA (`vite ^8.1.4`) using **TanStack Router** (`@tanstack/react-router ^1.170.17`, code-based/type-safe routes) and **TanStack Query** (`@tanstack/react-query ^5.101.2`) for all chain/AI data fetching — **not** the full-stack TanStack Start framework.

### Context
The app is mobile-first and must be **deployable as a static bundle** that a phone can install (see [ADR-003](#adr-003--capacitor-ready-pwa-over-a-native-app)). It talks to two backends it does not own the request lifecycle of: the Soroban RPC (via `@stellar/stellar-sdk ^16.0.1`) and the AI service. Every screen is essentially *"read some on-chain state, show it, let the user sign a write."* That is a data-fetching problem, not a server-rendering problem.

### Alternatives considered

| Option | Verdict |
|---|---|
| **TanStack Router + Query on Vite** (chosen) | Pure client SPA → clean `dist/` for PWA + Capacitor. Type-safe routing and caching without a server runtime. |
| **TanStack Start** (full-stack) | Great DX, but it assumes an SSR/server runtime. That fights a static-build target and adds a server we'd have to host and secure for no benefit — the AI backend already exists separately. |
| **Plain React + hand-rolled fetch** | Rejected: we'd reinvent caching, refetch, and loading/error states that Query gives for free (the LiveOnChain card refetches every 15s). |

### Rationale
- **Static-build compatibility is a hard requirement.** A pure Vite SPA emits a self-contained `dist/` that `vite-plugin-pwa` turns into an installable PWA and that Capacitor can wrap unchanged. TanStack Start's server runtime would undermine that.
- **Type-safe, code-based routing** gives compile-time route correctness (routes: `Home`, `Contribute`, `Spend`, `Setup`) without a filesystem-routing build step, which keeps the Capacitor/static story simple.
- **TanStack Query is the right primitive for chain reads.** Reads are the majority of the app; Query gives caching, background refetch, and loading/error states out of the box. Every read and write goes through a hook in `hooks/usePool.ts` (`usePool`, `useHasPool`, `usePoolBalance`, `useCreatePool`, `usePoolActions`).
- **No server to run means no server to secure.** The only backend is the stateless AI/chain-ops service; the web app is just files.

### Consequences
- **(+)** One `pnpm build` → a static `dist/` that is simultaneously a website, a PWA, and the input to a Capacitor build.
- **(+)** Free caching/refetch/loading semantics; the live on-chain card polls every 15s with no bespoke code.
- **(+)** Compile-time route safety.
- **(−)** No SSR/SEO — irrelevant for an authenticated group-treasury app.
- **(−)** Client-side rendering means a first-paint spinner on cold load — acceptable for a mobile app users install.

---

## ADR-003 — Capacitor-ready PWA over a native app

**Status:** Accepted (native/Capacitor build deferred to stretch)

### Decision
Ship a **mobile-first, installable PWA now** (`vite-plugin-pwa ^1.3.0`), architected so the same static `dist/` can be **wrapped with Capacitor** into an installable native build later — without a rewrite. No native (Swift/Kotlin/React Native) app in the hackathon window.

### Context
The target users are ordinary Filipinos in a **GCash-native, mobile-first** context. The app must feel like a phone app. But the build window is ~4 days to the Jul 15 deadline, and a native app would consume days on toolchains, store review, and platform-specific bugs — time the moat (the contract) needs more.

### Alternatives considered

| Option | Verdict |
|---|---|
| **PWA now, Capacitor-ready** (chosen) | Installable, mobile-shell UI today; a documented, low-risk path to a native package later. One codebase. |
| **Native (Swift/Kotlin) or React Native** | Rejected for the window: two platforms, store review, and no added trust — the trust lives in the contract, not the shell. |
| **Desktop-web only** | Rejected: contradicts the mobile-first, GCash-native user reality the judges reward. |

### Rationale
- **The moat is on-chain, so the shell is interchangeable.** A PWA delivers the mobile experience that matters (an `AppShell` with a bottom nav: Pool / Contribute / Spend / Rules) at a fraction of native's cost.
- **No browser-extension dependency on mobile.** Officer identities are in-app testnet keypairs (see [ADR-005](#adr-005--in-browser-personas--client-side-signing--backend-cli-keystore-the-no-secrets-model)), so there's no "install a wallet extension" wall on a phone. Freighter remains the "real wallet" story on desktop.
- **Capacitor wraps the exact `dist/` we already build.** Because [ADR-002](#adr-002--tanstack-router--query-on-vite-over-tanstack-start) keeps the app a static SPA, "go native" is a packaging step, not a port.

### Consequences
- **(+)** A real, installable mobile experience shippable inside the hackathon window.
- **(+)** A credible, concrete native roadmap (Capacitor) with zero architectural debt.
- **(−)** No app-store presence or deep native APIs during the hackathon (deferred by design).
- **(−)** PWA install UX varies by platform (notably iOS Safari) — acceptable for a demo, and the Capacitor path closes the gap when it matters.

---

## ADR-004 — Real test USDC as a SAC + faucet over native XLM zero-secret

**Status:** Accepted

### Decision
Settle the treasury in **test USDC represented as a Stellar Asset Contract (SAC)** on Testnet, minted by a local **USDC issuer** identity, with a backend **faucet** (`POST /faucet`) to fund demo accounts. Do **not** use native XLM as the pooled asset, even though XLM would have been the zero-secret fallback.

Deployed IDs (Testnet):

| What | ID |
|---|---|
| Test USDC SAC | `CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR` |
| USDC issuer (classic) | `GBYFIFSFQUE6M4O4ESBX7I4FU2XXPRI3V47C2BONMZBG6VKYCBSG55HM` |
| Canonical treasury (seeded 20,000 USDC) | `CBR36Q2AEAUQWZ6CXESIYEGWPYCDUDHQP62EEYFHS5JELW4T3FGKINF2` |
| First treasury (multisig proof) | `CBPAYECARJ5B4JR6B5HYLPZGSAHAXMIPWULWQ3JBXDXC7PP3WT2C3JLR` |

### Context
The hackathon explicitly rewards **user-facing financial apps with real utility, local anchors/assets, and composability** (wallets, DeFi, on/off-ramps). A pooled fund that settles in a *dollar stablecoin* is the honest, on-message representation of what these groups actually want — a stable store of value, on/off-rampable via anchors — not a volatile L1 gas token.

### Alternatives considered

| Option | Verdict |
|---|---|
| **Test USDC as a SAC + faucet** (chosen) | Matches the hackathon's USDC/local-asset steer; models real product settlement; composable with anchors and DeFi. |
| **Native XLM** (zero-secret fallback) | Simplest — no issuer, no trustlines, no faucet — but XLM is a volatile gas token, not what a *pondohan* saves in. It was the fallback if a secrets problem forced our hand; it didn't. |
| **Real Circle USDC on mainnet** | Rejected: real money, real risk, mainnet cost in a hackathon — inappropriate. Testnet USDC behaves identically for the demo. |

### Rationale
- **On-message with the judges.** "AI-governed treasury that settles in USDC" is a financial-utility story; "treasury that holds XLM" is not.
- **The contract is asset-agnostic; USDC is a config choice.** The contract stores a `Token` address and a raw `i128`; nothing about it is XLM- or USDC-specific. Choosing USDC costs the contract nothing.
- **A SAC lets a classic Stellar asset be called like a token contract.** The USDC SAC is deployed deterministically (`stellar contract asset deploy --asset USDC:<issuer>`) and reused; the treasury calls it via `token::TokenClient`.
- **The faucet keeps the demo self-contained.** `POST /faucet` mints test USDC to any address that already trusts USDC, using the issuer identity from the local CLI keystore — no external, rate-limited service in the demo path.

### Consequences learned during deploy
Two real-world behaviors of classic assets had to be handled — both are documented in `DEPLOYMENT.md` and both are, usefully, *exactly* the composability story:

1. **Units are raw.** The USDC SAC has **7 decimals**: `1 USDC = 10,000,000 raw`. The whole stack uses the convention `raw = human × 1e7` (`SCALE = 10_000_000` in `apps/web/src/lib/contract.ts`), with `rawToUsd`/`usdToRaw` helpers. For the demo, `1 USDC ≈ ₱1`, so dues ₱200 → `2,000,000,000` raw and the 20,000 seed → `200,000,000,000` raw.

2. **Trustlines are required.** A classic-asset recipient must establish a `change_trust` trustline *before* it can receive the asset. Minting into the contract worked (contracts are exempt), but the first transfer to a fresh payee failed until a trustline was added. Onboarding now creates trustlines client-side (`ensureTrustline` in `apps/web/src/lib/livepool.ts`) for every persona and the payee.

```
raw = humanAmount × 10_000_000        // SCALE = 1e7, USDC SAC = 7 decimals
₱200 dues   → 2,000,000,000 raw
20,000 seed → 200,000,000,000 raw
```

- **(+)** Correct, on-message financial-utility demo; a natural bridge to SEP-24 anchors and DeFi yield later.
- **(+)** Self-contained (own issuer + faucet), so the demo doesn't depend on a public faucet's uptime.
- **(−)** The app must handle 7-decimal scaling and trustlines — real complexity, but it's the *right* complexity, and a real on/off-ramp automates the trustline step anyway.

---

## ADR-005 — In-browser personas + client-side signing + backend CLI keystore (the no-secrets model)

**Status:** Accepted

### Decision
Model officer identities as **in-browser testnet keypairs** ("personas": *Kap. Ramon*, *Aling Nena*, *Kuya Jun*) generated on-device and stored in `localStorage`; **every write is signed client-side** with `basicNodeSigner`; and the **privileged chain ops** (deploy, initialize, faucet) run on a **local backend that invokes the Stellar CLI**, whose issuer/deployer secrets live in the **local CLI keystore**. **No secret key material ever appears in code, `.env`, the transcript, or the browser bundle.**

### Context
There are three distinct signing needs:

1. **Officer approvals** — real, per-officer signatures the contract's `require_auth` can attribute (this *is* the moat: the contract must know each `approve` came from a specific officer).
2. **Member contributions** — a `require_auth`'d transfer from the member's account.
3. **Privileged setup** — deploying/initializing a treasury and minting faucet USDC, which use the deployer/issuer identities.

Each need must be met **without leaking any secret** into any artifact a judge or attacker could see.

### Alternatives considered

| Approach | Where do secrets live? | Verdict |
|---|---|---|
| **In-browser personas + client signing; backend uses CLI keystore** (chosen) | On-device `localStorage` (personas) + local CLI keystore (issuer/deployer). Never in code/env/bundle. | Real signatures, real `require_auth`, zero materialized secrets. |
| **Backend signer** (server holds all keys, signs on behalf of users) | Server env / KMS. | Rejected: the *server* would become able to move everyone's money — it recreates the single point of failure Kolektibo exists to kill, and defeats `require_auth`'s attribution. |
| **Embedded secrets** (keys in the bundle or `.env` committed) | In the shipped artifact. | Rejected outright: any viewer of the bundle or transcript could drain funds. |

### Rationale
- **`require_auth` needs a real signer per actor.** The contract's guarantee — *"this approval came from Kap. Ramon, not an impersonator"* — only holds if Kap. Ramon's own key signs. In-browser personas signing via `basicNodeSigner` deliver exactly that: three independent keypairs, three real signatures, a genuine 2-of-3.
- **Secrets never leave the device.** Persona secrets are generated in the browser and stored only in `localStorage`; they are never transmitted. The client builds and signs transactions locally.

```ts
// apps/web/src/lib/wallet.ts — secrets generated on-device, never leave it
const personas = OFFICER_NAMES.map((name) => {
  const kp = Keypair.random()
  return { name, publicKey: kp.publicKey(), secret: kp.secret() }
})
localStorage.setItem('kolektibo.personas.v1', JSON.stringify(personas))
```

```ts
// apps/web/src/lib/livepool.ts — client-side signing via basicNodeSigner
const signer = basicNodeSigner(signerKp, NETWORK.passphrase)
return new Client({ ...base, publicKey: signerKp.publicKey(),
  signTransaction: signer.signTransaction, signAuthEntry: signer.signAuthEntry })
```

- **The backend never sees a secret either.** Deploy/init/faucet go through a `stellar()` helper that `execFile`-s the Stellar CLI (`STELLAR_BIN`) with `--source <identity-name>`; the CLI resolves that name against its **local keystore**. The secret is *referenced by name*, never read into the process. A chained `stellar keys show` (which *would* materialize a secret) was correctly blocked by the harness and deliberately avoided.
- **`--network testnet` is authoritative.** The `stellar()` helper strips `SOROBAN_RPC_URL` / `STELLAR_RPC_URL` / passphrase env vars from the child process, because a leaked `SOROBAN_RPC_URL` makes the CLI demand a matching passphrase (a bug we hit and fixed).

```ts
// services/ai/src/index.ts — CLI keystore by name; no secret materialized
const env = { ...process.env }
delete env.SOROBAN_RPC_URL; delete env.STELLAR_RPC_URL
delete env.STELLAR_NETWORK_PASSPHRASE; delete env.SOROBAN_NETWORK_PASSPHRASE
await pExecFile(CHAIN.bin, args, { env, maxBuffer: 16 * 1024 * 1024 })
// e.g. contract deploy --source kolektibo-deployer  (identity name, not a secret)
```

### The trust boundary

```
┌──────────────── BROWSER (per-device) ────────────────┐
│  personas: 3 keypairs in localStorage                 │
│  secrets NEVER transmitted; sign locally (basicNode-  │
│  Signer) → contribute / request_spend / approve /     │
│  execute are client-signed transactions               │
└───────────────┬───────────────────────────────────────┘
                │ signed tx (no secrets on the wire)
                ▼
        Stellar Testnet  ── require_auth attributes each signature
                ▲
                │ deploy / initialize / faucet, --source <name>
┌───────────────┴───────────────────────────────────────┐
│  LOCAL BACKEND (services/ai)                           │
│  execFile → Stellar CLI → identity resolved by NAME    │
│  from the LOCAL KEYSTORE; secret never read into proc  │
└───────────────────────────────────────────────────────┘
```

### Consequences
- **(+)** Real 2-of-3 multisig with genuine per-officer signatures — the moat is authentic, not simulated. Verified on-chain (see [ADR-008](#adr-008--a-minimal-but-real-soroban-contract-with-panic_with_error)).
- **(+)** **Zero secrets** in code, `.env`, transcript, or bundle. Nothing a judge downloads can move funds.
- **(+)** No wallet-extension wall on mobile; the app just works on a phone.
- **(+)** The architecture is verified end-to-end by `apps/web/scripts/smoke-write.mts` (create pool → fund → trustline → faucet → contribute → request → approve to 2-of-3 → execute), proving in-browser keys + client-side `basicNodeSigner` work on testnet.
- **(−)** `localStorage` personas are demo identities, not hardened wallets — clearing storage loses them, and they're not cross-device. In production these become separate people's real wallets (Freighter/mobile), which the design already anticipates.
- **(−)** The privileged CLI backend is a *local demo* convenience; a production deploy path would move deploy/init behind a proper deployer service. It holds **zero authority over an initialized pool's money** — only members and officers can move funds.

---

## ADR-006 — No database — the blockchain is the database

**Status:** Accepted

### Decision
Ship with **no application database**. All trust-critical state — balances, contributions, officers, threshold, categories/limits, spend requests, approvals, and execution status — lives **on-chain** in the Soroban contract. `localStorage` holds only client wallet state (personas, active pool id, payee). The AI/chain-ops backend is **stateless**.

### Context
The entire product thesis is that *the group can trust the fund because the rules are enforced by code the whole group can read, not by one person's honesty.* The moment any trust-critical number lives in a database an operator can edit, that thesis collapses — you'd be back to "trust the admin."

### Alternatives considered

| Option | Verdict |
|---|---|
| **Blockchain as the database** (chosen) | The ledger is complete, tamper-evident, and independently verifiable on a block explorer. Zero authority handed to any off-chain store. |
| **Off-chain DB as source of truth** (chain as a mirror) | Rejected: reintroduces a mutable, operator-controlled ledger — the exact single point of failure Kolektibo exists to kill. |
| **DB for everything, no chain** | Rejected: that's just the notebook with extra steps. |

### Rationale
- **Trust-critical state must be un-editable by any single party.** On-chain storage (the contract's `DataKey` map) is enforced by the network and auditable by anyone via `stellar.expert`. No admin can quietly change a balance or forge an approval.
- **The AI reads chain truth, never a cache.** `/ask` answers strictly from state the client fetched from the contract; there is no intermediate DB to drift out of sync or be tampered with.
- **A stateless backend is a small attack surface.** With no DB, there's no data store to breach, corrupt, or keep consistent — the backend only ever brokers CLI calls and LLM calls.
- **Reads are cheap and live.** The client reads directly via generated bindings (`get_balance`, `get_spends`, `get_officers`, `get_threshold`, `get_members`, `get_contribution`, `get_categories`), cached by TanStack Query and refreshed on an interval.

### When a database *is* warranted (documented, deferred)
A DB earns its place later **only for non-trust metadata that holds zero authority over money**:

| Would live in a DB | Would **never** live in a DB |
|---|---|
| Human-readable names (persona → "Kap. Ramon") | Balances, contributions |
| A pool directory / discovery index | Officers, approval threshold |
| Cross-device membership & sessions | Category limits |
| Push notifications | Spend requests & approvals |
| Event indexing / analytics (a read model over chain events) | Execution status |

The rule is explicit: **an off-chain DB may cache or annotate chain state, but it may never be the authority over a single unit of money.** Even a future indexer is a *read model* rebuilt from on-chain events (`contrib`, `spend_req`, `approve`, `execute`), never a writable source of truth.

### Consequences
- **(+)** The trust story is airtight: every trust-critical fact is on a public ledger anyone can verify. This *is* the pitch.
- **(+)** Nothing to provision, migrate, back up, or secure for the hackathon; the backend stays stateless.
- **(−)** No cross-device continuity yet (personas are per-browser) and no server-side search/notifications — all explicitly deferred to the metadata-DB tier above.
- **(−)** Rich queries (e.g. "all spends over ₱1,000 last quarter") require client-side iteration or a future indexer, since there's no queryable store today.

---

## ADR-007 — Create-your-own-pool onboarding (one treasury per group)

**Status:** Accepted

### Decision
Onboarding **deploys a fresh treasury contract per group**, initialized with that browser's officer personas as the officers. There is no shared, multi-tenant "master" contract; **one contract instance = one pool.** The app falls back to a **canonical demo pool** (`CBR36Q2A…INF2`) when the browser hasn't created its own.

### Context
A pooled fund has its own officers, its own threshold, its own categories and limits, and its own balance and history. Different groups must be fully isolated — one group's officers must have no power over another group's money.

### Alternatives considered

| Option | Verdict |
|---|---|
| **One contract per pool** (chosen) | Perfect isolation; each pool's policy and funds are physically separate on-chain; matches the contract's "one instance = one pool" design. |
| **One multi-tenant contract** (pools as rows) | Rejected: cross-tenant blast radius, per-pool auth logic inside one contract, and a single bug endangers *every* group's money. |
| **Fixed demo-only contract, no creation** | Rejected: judges should see a group actually *spin up their own fund* — that's the product, not a canned demo. |

### Rationale
- **Isolation is the safest default.** Separate contracts mean a group's officers, threshold, and balance are enforced independently; there is no shared state to leak across groups.
- **It matches the contract's shape exactly.** `initialize` is one-time per instance and sets that pool's token, officers, threshold, categories, and limits; `Officers`, `Threshold`, and balances are per-instance. The deploy-per-group model is the contract's natural grain.
- **The flow is real, on-chain onboarding.** `createPool()` in `apps/web/src/lib/livepool.ts` funds and trustlines the personas + payee, calls `POST /pool/create` (which `deploy`s the wasm and `initialize`s it with the officer pubkeys and the 2-of-3 policy), faucets test USDC, and seeds three real contributions (₱600 / ₱400 / ₱600). The new contract id is stored in `localStorage` and becomes the active pool.
- **A canonical fallback keeps the demo bulletproof.** `activePoolId()` returns the browser-created pool id or, if none, the seeded canonical treasury — so the app always has live on-chain state to show, even on a fresh device.

```ts
// apps/web/src/lib/contract.ts
export function activePoolId(): string {
  return localStorage.getItem('kolektibo.contract') || TREASURY_ID  // browser pool, else canonical
}
```

### Consequences
- **(+)** Complete per-group isolation; each pool's money and policy are physically separate on-chain and independently auditable.
- **(+)** The onboarding *is* the product demo: a group deploys its own governed treasury in one flow, then contributes and spends against it.
- **(+)** A seeded canonical pool guarantees the app always shows real live state, decoupling the read-path demo from a successful deploy.
- **(−)** A deploy per group costs a contract deployment (trivial on testnet) and, at real scale, would want a pool-directory service to find your pool across devices — precisely the metadata-DB tier from [ADR-006](#adr-006--no-database--the-blockchain-is-the-database).
- **(−)** Membership/officer sets are fixed at `initialize` in the current contract; changing officers later would require a contract upgrade or a governance function — out of scope for the hackathon.

---

## ADR-008 — A minimal-but-real Soroban contract with `panic_with_error`

**Status:** Accepted

### Decision
Write a **small, complete, and genuinely enforcing** Soroban contract (`contracts/treasury/src/lib.rs`, `soroban-sdk = "26"`, built to `wasm32v1-none`) rather than a large or partial one. Signal every policy violation with **`panic_with_error!`** against a typed `contracterror` enum, so failures are attributable, testable on-chain, and reverting by construction. Scaffold via `stellar contract init` to capture correct versions/toolchain (Rust `1.97.0`, Stellar CLI `27.0.0`).

### Context
The team was new to Stellar/Soroban, the window was ~4 days, and the contract is **the entire moat**. It had to be *real* (actually enforcing 2-of-3 and category limits on-chain) but *small enough to get correct and tested* in the time available. A half-real contract would sink the whole thesis.

### Alternatives considered

| Option | Verdict |
|---|---|
| **Minimal-but-real, `panic_with_error`** (chosen) | Every trust guarantee is enforced and provable; small enough to reach 4/4 tests + on-chain proof in the window. |
| **Feature-rich contract** (roles, upgrades, streaming, yield hooks) | Rejected for the window: more surface, more bugs, less time to prove the core guarantees that actually win. |
| **Mocked/partial enforcement** (checks in the client/AI) | Rejected outright: if the client or AI enforces policy, the AI *can* be tricked and the moat is fake. Enforcement must be in the contract. |
| **Ad-hoc `panic!` / string errors** | Rejected: not attributable, not cleanly assertable from the generated client. |

### Rationale — the contract enforces the whole thesis
The contract's surface is exactly what the demo loop needs, no more:

| fn | who | guarantee |
|---|---|---|
| `initialize(token, officers, threshold, categories, limits)` | deployer (one-time) | validates `threshold` and lengths, else `InvalidInit (8)` |
| `contribute(from, amount)` | any member (`require_auth`) | pulls USDC in; records contribution + member; `NonPositiveAmount (10)` guard |
| `request_spend(proposer, category, amount, recipient, memo) -> u32` | officer (`require_auth`) | must be officer (`NotOfficer (2)`); category cap (`OverCategoryLimit (3)`); auto-records proposer approval |
| `approve(officer, spend_id)` | officer (`require_auth`) | `SpendNotFound (4)`, `AlreadyExecuted (5)`, `AlreadyApproved (7)` |
| `execute(spend_id)` | **permissionless** | reverts unless `approvals ≥ threshold` (`NotEnoughApprovals (6)`); `InsufficientBalance (9)`; transfers USDC; marks executed |
| views | anyone | `get_balance`, `get_spend`, `get_spends`, `get_officers`, `get_threshold`, `get_members`, `get_contribution`, `get_categories` |

The full typed error set (`contracterror`, `repr(u32)`):

```
1 AlreadyInitialized   2 NotOfficer          3 OverCategoryLimit
4 SpendNotFound        5 AlreadyExecuted     6 NotEnoughApprovals
7 AlreadyApproved      8 InvalidInit         9 InsufficientBalance
10 NonPositiveAmount
```

Design choices inside the contract that matter:

- **`execute` is permissionless *on purpose*.** Anyone can push the button, but it reverts unless `approvals.len() >= threshold`. The gate is the *approval count*, not who calls execute — so no officer can withhold execution once the group has agreed, and no one can execute early.
- **`request_spend` auto-records the proposer's approval**, so a 2-of-3 needs exactly one more officer — matching how a real motion works (the proposer already assents).
- **`panic_with_error!` makes every guarantee both revert-by-construction and testable.** The generated `try_` client surfaces a panic as a `soroban_sdk::Error`, so tests assert precisely with `Error::from_contract_error(code)`.

```rust
// contracts/treasury/src/lib.rs — the moat, in one function
pub fn execute(env: Env, spend_id: u32) {
    // ... load spend, reject if executed ...
    let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
    if spend.approvals.len() < threshold {
        panic_with_error!(&env, Error::NotEnoughApprovals);   // Error #6 — no single officer can drain
    }
    // ... balance check, transfer USDC to recipient, mark executed ...
}
```

### Proven, not asserted
The guarantees are verified twice — in unit tests and on live testnet:

**`cargo test` — 4/4 pass** (`contracts/treasury/src/test.rs`):

| test | proves |
|---|---|
| `full_happy_path` | contribute → request → approve to 2-of-3 → execute; vendor receives funds |
| `cannot_execute_without_threshold` | 1 approval → `try_execute` returns `Error #6` NotEnoughApprovals; vendor balance stays 0 |
| `rejects_over_category_limit` | 6,000 vs a 5,000 Equipment cap → `Error #3` OverCategoryLimit |
| `non_officer_cannot_propose` | a plain member proposing → `Error #2` NotOfficer |

**On-chain proof** (`DEPLOYMENT.md`, treasury seeded 20,000 USDC): a single officer's `execute` reverted `Error(Contract, #6)`; a duplicate approval reverted `Error(Contract, #7)`; a non-officer proposal reverted `Error(Contract, #2)`; an over-limit request reverted `Error(Contract, #3)`; and after a genuine 2-of-3, `execute` produced a **real USDC `transfer`** (balance `200000000000 → 199999999000`). Proof tx: `127e4e3f868798c3df9d6d8f4376d18e38d80dc9b470f961cb87420d1aa31278`.

### Consequences
- **(+)** Every trust guarantee is enforced in the contract and independently verifiable on a block explorer — the moat is real, not narrated.
- **(+)** Small surface + typed errors + `try_` assertions made 4/4 tests and full on-chain proof achievable inside a 4-day window by a team new to Stellar.
- **(+)** A size-optimized release profile (`opt-level = "z"`, `lto = true`, `panic = "abort"`, `strip = "symbols"`) keeps the wasm small and cheap to deploy.
- **(−)** Deliberately omitted features: officer rotation, contract upgrades, per-category *monthly* windows (limits are per-spend caps), streaming, and native yield hooks. These are future work, not gaps in the thesis.
- **(−)** One toolchain hazard surfaced and was pinned: `ed25519-dalek 3.0.0` broke `soroban-env-host` testutils, fixed via `cargo update --precise 2.2.0` (tests only; the deployable wasm build was unaffected). SDK 26 also emits a harmless deprecation warning on `env.events().publish`.

---

## Cross-cutting principle, restated

Read top to bottom, the eight decisions all defend the same line:

```
        AUTHORITY OVER MONEY          │        INTERFACE & LABOR
  ───────────────────────────────────┼───────────────────────────────────
  Soroban contract (ADR-008)         │  OpenAI treasurer      (ADR-001)
  On-chain state = DB (ADR-006)      │  Vite PWA + TanStack   (ADR-002/003)
  Real per-officer signatures        │  In-browser personas   (ADR-005)
    + require_auth      (ADR-005)    │  Stateless CLI backend (ADR-005/006)
  USDC settlement       (ADR-004)    │  Create-pool onboarding(ADR-007)
  One contract per pool (ADR-007)    │
```

Anything on the **left** is enforced by code the whole group can read and a public ledger anyone can audit. Anything on the **right** is convenience, and is deliberately built to hold **zero authority** over a single unit of the group's money. That separation is the product — and it is the reason each of these decisions went the way it did.
