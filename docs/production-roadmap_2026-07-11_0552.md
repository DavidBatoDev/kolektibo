# Kolektibo — Production Roadmap (hackathon → product)
_Created: 2026-07-11 05:52 MPST · Kolektibo · Stellar_

The hackathon build (Soroban treasury + AI treasurer + PWA; testnet-verified, QA-passed) is done. This is the plan to turn it into a real product for the Philippines, grounded by three research passes (30+ competitor products; the July-2026 Stellar production stack; PH regulation + Supabase patterns) and an independent red-team review against the actual repo.

> **Companion artifacts:** `supabase/migrations/0001_init.sql` (schema v1 as code), `supabase/README.md` (setup), and `docs/execution-log_*` (running progress). Baseline product/on-chain state: `docs/06-deployment-and-onchain-proof_*`, `DEPLOYMENT.md`.

## The one architecture law

**Money authority lives only in Soroban contracts on Stellar. Supabase holds identity, directory, metadata, receipts, notifications, and read-models — with zero authority over funds.** If the database is wiped, not one centavo is at risk. This single rule is simultaneously the product moat, the security model, and the regulatory strategy.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Custody | **Passkey smart wallets** (OpenZeppelin Smart Accounts + `smart-account-kit`) | Fingerprint approvals, no seed phrases — the only fit for barangay/co-op users |
| Auth (launch) | **Email magic-link + Google OAuth** (+ anonymous→link); phone OTP later | Free, fast; SMS cost deferred |
| Sequencing | **Hackathon follow-through first**, then production phases | Jul 15 submit → Jul 18 Demo → Jul 24 Finale → SCF |
| Paluwagan/ROSCA mode | **Post-hackathon (Phase 3)** — descoped from the demo ([decision record](./decision-descope-paluwagan_2026-07-11_1345.md)) | Strong PH-native wedge; retained + verified, but kept out of the single-idea demo |

## Strategic findings (that shaped this plan)

1. **The moat is an unoccupied intersection.** ROSCA/paluwagan apps (Chamasoft, Golak, Money Club, Sinking Fund PH) do record-keeping only — the treasurer still physically holds the money. Crypto multisigs (Safe $100B+, Squads $10B+) prevent theft structurally but have no cultural fit or PH rails. Kolektibo is the only product at **structural theft-prevention + paluwagan form + AI transparency**.
2. **Invisible crypto or die.** Bloinx (a blockchain+stablecoin ROSCA) died ~2022 because the blockchain was too visible and onboarding killed it; Coins.ph/Fuse succeed by hiding crypto entirely. Passkeys, no seed phrases, no gas, and ₱-denominated UX are existential, not nice-to-have.
3. **BSP VASP moratorium is in force (2026, indefinite).** New licenses are unavailable, so **staying outside the VASP perimeter is the strategy** — and the non-custodial architecture already achieves it.
4. **Funding spine exists.** SCF 7.0 Build Award (≤$150k XLM, milestone tranches 10/20/30/40%) + Soroban Audit Bank (audit credits, 5% refundable co-pay). Phases are shaped to map onto SCF milestones.

**Capacity note:** week ranges assume a 2–3 person full-time team post-hackathon; solo execution ~2×. Phases are independently shippable, so the timeline degrades gracefully.

---

## 🔴 P0 — before anything else

- **Secret hygiene (done in this build):** the Supabase access token was in the working copy of `.mcp.json` (a tracked file in a public repo). Fixed by parameterizing to `${SUPABASE_ACCESS_TOKEN}` / `${SUPABASE_PROJECT_REF}`; local secret files gitignored; full git-history scan came back clean (no secret ever committed). **Action remaining (owner):** rotate the exposed token in the Supabase dashboard; it also transited the build transcript.
- Keep the Supabase MCP `--read-only`. All schema changes go through migration files and are applied only with explicit per-migration approval.

## Phase 0 — Hackathon follow-through + long-lead foundations (now → Jul 24)

- Submission (Jul 15) → Demo Day (Jul 18) → Grand Finale (Jul 24) — mechanics per `docs/10-roadmap-and-next-steps_*`.
- **SCF 7.0 Build Award** application (milestones = Phases 1–4); **Soroban Audit Bank** application submitted once the v2+paluwagan scope is frozen (audits need a frozen scope + queue lead time).
- **Start the legal-entity workstream now (long pole):** register the entity (SEC corp/OPC) — prerequisite for the anchor agreement (MoneyGram onboarding takes weeks–months of compliance review), NPC registration (a DPO must belong to an entity), ToS, SCF payout, and counsel. Begin anchor conversations immediately; Phase 2's fiat edge is **gated on a signed anchor agreement**.

## Phase 1 — Identity & persistence foundation (Supabase) 〔≈ wks 1–3〕

Goal: kill the single-browser limitation; every user has an account, profile, and pools that follow them across devices.

1. Supabase project (real ref) + migrations-as-code + CI type-gen (shared package, fail on drift) + branch previews. **Pro plan ($25/mo)** from real launch (kills auto-pause; adds backups).
2. **Auth:** email magic-link + Google OAuth; **anonymous sign-in → `linkIdentity()` upgrade** so invitees can *view* a pool before signing up; Turnstile + rate limits. No password auth (so no leaked-password surface). Phone OTP deferred to Phase 5.
3. **Schema v1 + RLS** (see `supabase/migrations/0001_init.sql`).
4. **Profile CRUD & settings:** display name, avatar (owner-folder Storage policy), locale, currency display, notification prefs. **Account deletion (DPA):** blocked while the user is an active officer or a pending paluwagan payee; off-boarding order = officer rotation / cycle completion first; FK `ON DELETE` policy + actor tombstones so `audit_log` attribution survives erasure.
5. **i18n framework now** (string externalization, en/tl) — retrofitting later costs a week; the full Taglish pass lands Phase 5.
6. **Wallet linking with proof-of-ownership:** nonce challenge signed by the Stellar key; only `verified_at` addresses can be pool signers. Legacy `localStorage` personas keep working (`legacy_local`) until Phase 2 migration.
7. **Pools & membership:** create/join via invite link/QR; **atomic invite redemption** (`invite_redemptions` + `used_count`); **anonymous preview via a `SECURITY DEFINER` RPC `preview_pool(invite_code)`** returning a limited read-model — invites are never blanket-readable (codes leak roles), redemption is by code through the RPC only. Named-payee address book.
8. **Indexer v0:** checkpointed `getEvents` poller (RPC retains only ~24h) → `chain_events` → Realtime in-app feed + Web Push (VAPID, `push_subscriptions`). **RLS allow/deny test suite lands with each migration.**
9. **Backend v1:** replace the CLI-shelling in `services/ai` with stellar-sdk server code (pool deploy, faucet, nonce challenge, notification fan-out; OpenAI proxy unchanged); secrets in env/KMS; service-role key never client-side.

## Phase 2 — Custody & money UX ("invisible crypto") 〔≈ wks 3–7〕

Order matters: **contract v2 first, then migration, then passkeys go live as officers.**

1. **Contract v2** (upgradeable): `update_current_contract_wasm` behind officer-threshold admin; `manage_officer`; monthly rolling category budgets; pause switch; enriched events; dues schedule; **TTL discipline** (persistent storage + a TTL-extension keeper — Protocol 23 auto-restore softens this but idle groups must not lapse). Unit + property tests land with the feature.
   - **v1→v2 migration** (v1 has *no* upgrade entrypoint — verified in `contracts/treasury/src/lib.rs`): deploy a fresh v2 instance → officers approve a v1 `execute` paying the v2 contract address → mark the old pool `migrated` (`pools.contract_version`/`wasm_hash` track the fleet). **Fleet-upgrade authority = per-pool officer approval** (chosen over any platform admin key, which would break the non-custodial posture); documented in ToS.
2. **Passkey smart accounts:** **OpenZeppelin Smart Accounts for Stellar** (audited + Certora) via `smart-account-kit` — *not* legacy `passkey-kit` (unaudited, demo-only per its own README). **Key-loss is designed, not runbooked:** enrollment requires ≥2 passkeys (or passkey + recovery signer/policy); add-device flow; officer replacement via v2 `manage_officer`. The smart-wallet SEP is unfinalized — pin versions.
3. **Gasless:** **OpenZeppelin Relayer + Channels** (Launchtube deprecated/archived Mar 2026) + sponsored reserves; backend fee-bump fallback. **Abuse controls:** per-account sponsorship quotas + rate limits so a hostile signup loop can't drain the relayer float.
4. **Persona migration:** in-app flow moves each legacy officer to a passkey smart account via v2 officer rotation (depends on 1 + 2).
5. **Money-UX table stakes:** transaction-queue UI, plain-language tx preview before signing, batching, address book everywhere, CSV/PDF export (barangay audit format), receipts (`spend_meta` + Storage), recurring dues reminders + one-tap "nudge" (GCash KKB pattern).
6. **Fiat edge v1 (gated on the anchor agreement):** **MoneyGram Ramps** (SEP-24, USDC, PH cash-in/out live since 2022); the anchor owns KYC in its hosted webview; the app never touches conversion. **Settle in USDC — no PHP stablecoin exists on Stellar** (Coins.ph PHPC is Polygon/Ronin); ₱ is a display currency (labeled rate feed) and a cash-out endpoint.

## Phase 3 — Paluwagan mode 〔≈ wks 6–9, overlaps 2〕

> **Descoped from the hackathon demo** — see the [decision record](./decision-descope-paluwagan_2026-07-11_1345.md). The paluwagan contract is already built + testnet-verified (6/6 tests, zero-sum rotation); this phase adds only the read-model + UI. Kept out of the Jul 15 demo to keep it single-idea.

1. **Contract mode** `Paluwagan { contribution, period, payout_order, cycle }`: cycle-aware `contribute()`; permissionless `advance_cycle()` auto-pays the cycle's payout **address** when all contributions are in; shortfalls need officer threshold to force/skip (the group governs itself). Payout order fixed at init — drawn in-app via commit-reveal (proof stored) or physically. Auction/bidding deferred. Tests land with the feature.
2. **Read-model that can run it:** `paluwagan_cycles` + `cycle_contributions` (who-hasn't-paid drives reminders/penalties) + stored `payout_order` with commit-reveal proof; payout tracked as **address + user_id**.
3. **Default handling:** auto-penalty display, reminder escalation, missed-payment status. Defaulter substitution + guarantee funds **parked for counsel** (EMI/lending implications).
4. **Regulatory positioning (mandatory):** private groups only; **zero "invest/returns/profit/guaranteed" language** anywhere; the app never pools the pot; no interest/app capital (RA 9474 lending trap); SEC anti-scam advisories surfaced as in-app education; ToS states Kolektibo is a coordination tool and the group operates its own paluwagan.

## Phase 4 — Production launch readiness 〔≈ wks 8–12 → mainnet pilot〕

1. **Security:** external contract audit via the **Soroban Audit Bank** (OtterSec/Veridise) on the frozen v2+paluwagan scope; `get_advisors` lints clean (RLS-everywhere 0013, initplan 0003, search_path 0011); dependency scanning (dependabot + cargo-audit); backend rate limiting; secrets audit; MFA for officers; **sanctions screening at onboarding** (UN/ATC/OFAC); pen-test lite.
2. **QA hardening** (per-feature tests already landed in P1–P3): CI assembly — nightly testnet integration deploys; Playwright E2E porting the proven manual QA matrix (`docs/qa-report_*`); vitest on lib/hooks; `smoke.mts`/`smoke-write.mts` as fast chain checks; envs local → staging (testnet) → prod (mainnet); trunk-based + preview deploys + feature flags.
3. **Scalability/infra:** commercial RPC (Validation Cloud/QuickNode) behind a proxy (rotation/caching); **indexer v1** (SubQuery self-host → Postgres, or Mercury); hosting Vercel/Cloudflare + CDN; Sentry (release-tagged); uptime + status page.
4. **DR:** `chain_events` **cannot be rebuilt from RPC** (~24h retention) — a documented read-model rebuild procedure naming the archival source (SubQuery full sync / Mercury / Hubble-BigQuery); PITR tier decision; a restore drill actually performed.
5. **Error handling:** central `mapContractError()` — contract codes → friendly Taglish ("Kulang pa ang approvals — 2 of 3 officers needed"); RPC retry/backoff + failover; full tx-lifecycle UX (queued → signing → submitted+hash → confirmed; timeout → "check explorer"); offline PWA.
6. **Admin tools:** internal dashboard (service-role via backend only): pool registry + fleet contract-version view, user support lookup, invite-abuse controls, feature flags, audit-log viewer, indexer health, anchor-flow monitor, sponsorship-quota monitor; support runbooks (lost passkey → recovery, stuck tx, wrong payee).
7. **Analytics:** PostHog (signup → create/join → first contribution → first release funnels; retention cohorts; no PII in payloads) + business dashboard from `chain_events` (pools, TVL, disbursements, cycles, AI usage). **North star: weekly active pools with ≥1 on-chain event.**
8. **Compliance ops:** NPC registration (DPS + DPO), privacy notice + granular consent, PIA, 72-hr breach runbook, processor agreements (Supabase, anchor), retention schedule; counsel review of the VASP posture pre-mainnet; RA 11765 disclosures.
9. **Mainnet cutover facts:** mainnet pools initialize against the **Circle USDC SAC — not the demo `kolektibo-usdc-issuer` asset**; testnet pools/smart accounts **do not migrate**; trustline UX is handled by sponsorship.
10. **Mainnet pilot:** one real group (known barangay org/co-op), small caps, concierge onboarding. Success = one full month of dues + ≥1 governed disbursement + zero critical incidents. Capacitor Android build for the pilot.

## Phase 5 — Growth & composability 〔post-pilot〕

- **Yield (opt-in per group):** DeFindex vaults → **Blend blue-chip USDC pool only** (the Feb-2026 exploit hit an isolated community pool via oracle manipulation; core intact), capped allocation + liquid buffer, officer-threshold-gated `invest_idle`/`redeem`, risk disclosure. ⚠️ Counsel sign-off first — yield language touches the SEC "returns" trap; copy stays "the group's own funds, variable, not guaranteed."
- **Phone OTP** (Twilio Verify ≈ $0.10/verification, high-assurance actions only) + QR Ph; full Taglish pass; accessibility.
- **Power users:** Stellar Wallets Kit (Freighter/LOBSTR/xBull/WalletConnect) as a secondary signing path.
- **Social layer:** activity comments + meeting minutes/attendance (schema v2).
- **Monetization (VASP-safe = flat SaaS, never per-transfer spread):** free core → Pro pool (₱/member/mo, Chamasoft model): export packs, receipts OCR, AI tiers (metered via `ai_usage`), multi-pool, priority support. Later: credit-history partnerships, guarantee fund (parked for counsel).

---

## Compliance posture (roadmap-level — counsel confirms before mainnet; not legal advice)

| Rule | Why |
|---|---|
| Never custody/co-sign keys; app proposes, members sign | Outside the VASP perimeter (BSP Circular 1108); moratorium = no new licenses anyway |
| Never convert VA↔fiat/VA↔VA in-app; anchor-only | The "exchange" trigger |
| Never app-issued balance/top-up/float | EMI trap (₱100–200M capital) |
| Flat SaaS fees, never per-transfer spread | "Fee-for-facilitation as a business" pulls into VASP |
| Paluwagan: private, no returns-language, never operator, no interest | SEC unregistered-securities + RA 9474 lending traps |
| NPC registration, DPO, PIA, 72h breach runbook, consent, processor agreements | Data Privacy Act — fintech = "risky processing" |
| Sanctions screening at onboarding (UN/ATC/OFAC) | AML-lite; the anchor owns KYC + travel rule (≥₱50k) |
| Escape hatch: BSP/SEC sandboxes if the model drifts | Both active and admitting crypto models |

## Cost model (monthly, pre-revenue steady state → maps to SCF tranches)

Supabase Pro $25 · commercial RPC ~$50–200 · indexer (SubQuery self-host ~$20 VM / Mercury quote) · relayer XLM float + sponsored reserves (usage-based, quota-capped) · OpenAI ~$10–50 · Sentry/PostHog free tiers ~$50 · hosting ~$0–20 · SMS $0 until Phase 5 · entity/counsel/NPC one-offs (entity ~₱15–30k, counsel retainer TBD). **≈ $155–345/mo + one-offs** — inside an SCF first tranche.

## Target production architecture

```
   PWA / Capacitor (React · TanStack) ── passkey signing (OZ Smart Accounts / smart-account-kit)
      │ Supabase Auth session · ₱-first display
      ├── signed txs → OZ Relayer/Channels (sponsored, quota-limited) → Stellar (Soroban treasury v2 + paluwagan)
      └── REST/Realtime (RLS) → Supabase (Auth · Postgres · Storage · Realtime · Edge Fns · pg_cron)
   Stellar events → Indexer (v0 poller → v1 SubQuery/Mercury) → chain_events → feeds + notifications
   Backend (stellar-sdk deploys · nonce challenge · AI proxy · KMS) ←→ OpenAI · MoneyGram Ramps (SEP-24 fiat edge)
```

## Coverage map (the areas you asked for → where they live)

Core features P1–P3 · user settings P1.4 · profile CRUD P1.4 · auth flows P1.2 + P2.2 · database structure (`supabase/migrations/0001_init.sql`) · QA/testing per-phase + P4.2 · security P0 + P4.1 · scalability P4.3–4 · admin tools P4.6 · error handling P4.5 · analytics P4.7 · market-standard features P2.5/P3/P5 (invite-links, feeds, exports, dues+nudges, receipts, address book, tx queue+preview, penalties; comments/minutes explicitly Phase 5).

## Verified stack references (July 2026)

Passkeys: OpenZeppelin Smart Accounts (`OpenZeppelin/stellar-contracts` accounts) + `kalepail/smart-account-kit`; legacy `kalepail/passkey-kit` is demo-only. Sponsorship: OpenZeppelin Relayer/Channels (Launchtube archived Mar 2026) + sponsored reserves (CAP-33) + fee-bump (CAP-15). PH ramp: MoneyGram Access/Ramps on Stellar (USDC, SEP-24). Stablecoin: Circle USDC on Stellar (CCTP live May 2026); no PHP stablecoin on Stellar. Indexing: RPC `getEvents` (~24h retention) + Mercury / SubQuery. Yield: Blend v2 via DeFindex vaults, blue-chip USDC pool only. Contract: `update_current_contract_wasm` upgrades, persistent-storage TTL + keeper (Protocol 23 auto-restore). Audit: Soroban Audit Bank (OtterSec/Veridise). Funding: SCF 7.0 Build Award (≤$150k XLM).
