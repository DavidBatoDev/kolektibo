# Production implementation status — updated 2026-07-15

This is an engineering status record for the hosted testnet product. It is not a claim that
Kolektibo is audited or mainnet-ready.

## Implemented

- Public product, authentication, onboarding, and phone-width authenticated product shells.
- Cross-device Supabase identity, verified wallet linking, pool directory, invitations with local
  QR rendering, roster, payees, account deletion, and lifecycle-aware feature guards.
- Resumable pool creation with normalized contribution, category, and approval-tier records.
- Pool activity, contributions, spending, approvals, people, payees, goals, rules, reports,
  receipts, and general/contribution/governance/security/archive settings.
- Checkpointed Stellar event indexing with member-scoped reads and Supabase Realtime backfill.
- Supabase-only Web Push: notification inserts trigger the hosted `push` Edge Function; VAPID
  private material stays in Supabase secrets and the browser fetches only the public key.
- SDK chain backend for treasury deployment and test-USDC minting, with explicit CLI fallback,
  CORS allowlisting, and per-IP/per-address abuse limits.
- English/Tagalog runtime localization across the product shell and primary account/workspace
  screens, plus PHP/USD/USDC display preferences. Settlement authority remains the Soroban contract.
- CSV and PDF audit exports using indexed events, with private receipt links scoped to members.

## Hosted Supabase state

The linked project `protxmboekwtzxpwmplt` contains migrations `0001` through `0010` plus:

- `20260715084008_supabase_push_notifications`
- `20260715101500_pool_governance_policy_rpc`
- `20260715104500_activate_testnet_product_flags`
- `20260715120000_harden_pool_governance_policy_rpc`

The `push` Edge Function is active. `production_shell`, `multi_pool`, and `pool_wizard_v1` are on;
`passkey_wallets` and `contract_v2` deliberately remain off. Generated web database types match the
hosted schema.

## Validation completed

- Backend TypeScript check and production PWA build pass.
- The SDK backend passed the full live testnet write loop: deploy, faucet, contribute, request,
  approve, execute, and final-balance verification.
- The live Playwright push test passed end to end: a real signed testnet `spend_req` was indexed,
  fanned out to Supabase, delivered by the Edge Function, received by the service worker, and shown
  in the in-app notification list.
- `.github/workflows/ci.yml` runs deterministic type/build/browser checks on pull requests and main.
  `.github/workflows/live-testnet.yml` runs the serialized real testnet push path nightly or manually.
  Its private values are installed as encrypted GitHub Actions secrets; public network identifiers
  are repository variables.

## Deliberately not represented as complete

- Treasury contract v2, passkey smart accounts, signer rotation/recovery, sponsored transactions,
  and v1-to-v2 migration.
- Mainnet, fiat anchors, real-money operations, staff operations privileges, legal/compliance
  acceptance, independent security review, disaster recovery, and production observability.
- A hosting-provider deployment for the web and Node API. The hosted database/Edge Function and CI
  are configured, but publishing those two runtimes requires choosing their deployment targets.

The current release boundary is an internally testable Stellar Testnet beta. Supabase is identity,
metadata, read models, Realtime, and delivery only; it has no capability to move pooled funds.
