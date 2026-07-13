# Production implementation status — 2026-07-14

This document maps the production application plan to the first implemented slice. It is an
engineering status record, not a claim that the application is mainnet-ready.

## Implemented in this slice

- Public product routes for landing, how it works, features, security, pricing, about, help,
  status, and legal disclosures.
- The original three-person testnet experience moved to `/demo`, including explicit empty states
  when its sample pool has not been created.
- Responsive production shell with the Home, Pools, Activity, Wallet, and More navigation model.
- Strict authenticated `/app` routes and a useful no-pool dashboard with create, join, and demo
  paths.
- Email/password and Google entry points, ten-character password validation, required terms,
  privacy, and age consent, email verification, and OAuth callback consent completion.
- Profile, wallet, recovery, and completion onboarding routes. Current wallet setup is still the
  existing testnet wallet path; passkey smart accounts are not represented as complete.
- A resumable six-step pool wizard covering basics, contribution coordination, spending policy,
  approval tiers, people, wallet readiness, review, and draft creation.
- Pool workspaces for activity, contributions, spending, approvals, members, invites, payees,
  goals, rules, reports, and settings.
- An approval-gated additive Supabase migration for lifecycle states, operational roles versus
  signers, normalized policies, goals, attachments, consent history, and smart-wallet readiness.
- Updated Playwright smoke coverage for the production landing and separated demo.

## Validation and activation status

- `0006_production_foundation.sql` has been applied and replayed on the disposable local Supabase
  stack. Schema lint and the production-foundation RLS smoke test pass, and database types were
  regenerated from that local schema.
- Remote application is still pending because the configured Supabase access token cannot access
  the project referenced by `apps/web/.env.local`. Do not treat the hosted schema as migrated until
  an authorized token successfully completes `supabase db push`.
- Contract v2, OpenZeppelin smart accounts, two-passkey enforcement, relayer sponsorship, and v1
  migration are not implemented. The wizard labels policy fields that the current v1 contract
  cannot enforce.
- Mainnet, fiat anchors, operations privileges, PDF audit packs, push delivery, and production
  indexing are not activated. None should be simulated as working in the client.

## Next safe implementation sequence

1. Link the authorized hosted Supabase project, push the locally validated migration, then run the
   hosted Security and Performance advisors.
2. Wire the normalized policy, goals, attachments, and role screens to the approved schema and
   add cross-pool authorization tests.
3. Specify and property-test treasury contract v2 before connecting the wizard's extended policy
   controls to money movement.
4. Integrate passkey smart accounts and recovery, then a quota-controlled testnet relayer.
5. Replace direct chain polling with the checkpointed indexer and complete notification/reporting
   workers.
6. Add internal operations endpoints and UI only after a server-enforced staff authorization model
   exists.

## Current release boundary

This branch is suitable for continued internal testnet development. It is not suitable for audited
mainnet use until the contract, custody, indexing, operations, compliance, and acceptance work above
is complete.
