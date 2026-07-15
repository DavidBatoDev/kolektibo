# Autonomous Agent operations and trust boundary

Kolektibo's Agent is an authenticated, cross-pool workspace and a constrained Testnet treasury
executor. It can explain pool activity, expose every model tool call, draft a mandate, and later
execute a payment autonomously only after the pool's officers have approved the exact limits
on-chain.

## Money flow

1. The server builds context from pools the signed-in user belongs to. Model tools repeat that
   authorization check and read pool summaries, activity, mandates, payees, categories, and goals.
2. Chat may draft a structured mandate but cannot activate or execute it.
3. An officer signs `propose_mandate` from their own wallet. Other officers approve through the
   usual pool threshold and anyone may finalize once the threshold is met.
4. Supabase schedules the next due execution. A service-role RPC uses `FOR UPDATE SKIP LOCKED` so a
   job is claimed once even when several workers poll together.
5. The worker evaluates deterministic conditions, decrypts only that pool's agent key, and signs
   `execute_mandate` with the exact on-chain mandate ID.
6. Soroban rechecks the signer, status, start time, interval, expiry, execution count, exact payee,
   category and amount, category cap, and post-payment balance floor before moving USDC.
7. The transaction hash, run, tool steps, and execution result remain visible to pool members.

The model never receives agent secret keys and has no tool that directly transfers money. Model
output is advisory or draft data; the deterministic scheduler and the Soroban contract are the
execution authorities.

## Governance and emergency controls

- Mandates are created by officers and activate only at the existing pool approval threshold.
- Any officer can pause an active mandate immediately.
- Resume and revoke actions use the pool approval threshold.
- A mandate has a fixed recipient, category, raw token amount, schedule, expiry, maximum execution
  count, minimum balance floor, and condition commitment.
- v1 pools do not change automatically. Officers stage a new v2 contract, approve moving the old
  balance through the existing v1 spend flow, then activate v2 only after the old on-chain balance
  reaches zero.

## Required server configuration

```dotenv
TREASURY_V2_WASM_HASH=ac4ec50f445fb38e6ff785b839351b76bd15225b9920342f52638aed3b672457
AGENT_KEY_ENCRYPTION_KEY=<32 random bytes, base64 or hex>
AGENT_WORKER_SECRET=<random internal worker secret>
AGENT_AUTONOMY_ENABLED=1
AGENT_WORKER_ENABLED=1
```

Generate fresh local values with `pnpm agent:secrets`. Keep both secrets in the server's secret
manager; neither can use a `VITE_` prefix. Start with `AGENT_WORKER_ENABLED=0` until the migration
and API deployment are confirmed, then run one always-on worker deployment. The internal manual
tick endpoint also requires `x-agent-worker-secret`.

## Supabase deployment

Apply `supabase/migrations/20260715140000_autonomous_treasury_agent.sql`, run the companion SQL
test, and regenerate the web database types:

```bash
supabase db push --linked
supabase gen types typescript --linked > apps/web/src/db/types.gen.ts
```

The migration publishes `agent_runs`, `agent_run_steps`, and `agent_mandates` to Supabase Realtime.
Realtime is a UI delivery mechanism only. It does not push money and cannot bypass Stellar.

## Verification

```bash
cargo test -p treasury --manifest-path contracts/Cargo.toml
pnpm --filter @kolektibo/ai exec tsc --noEmit
pnpm build
pnpm exec playwright test tests/e2e/agent.spec.ts --project=chromium
```

For Testnet operations, verify every code hash, contract ID, mandate ID, and payment transaction on
Stellar Explorer. This implementation is not audited or approved for mainnet funds.
