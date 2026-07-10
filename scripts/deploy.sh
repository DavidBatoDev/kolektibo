#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy the Kolektibo treasury to Stellar Testnet.
#   Usage:  bash scripts/deploy.sh
# Run from anywhere; paths are resolved relative to this script.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$HERE/env.sh"

NETWORK=testnet
CONTRACTS="$ROOT/contracts"

echo "▶ 1/6  Ensuring funded deployer + officer identities…"
for name in kolektibo-deployer kolektibo-officer2 kolektibo-officer3 kolektibo-usdc-issuer; do
  stellar keys generate "$name" --network "$NETWORK" --fund 2>/dev/null || \
    stellar keys fund "$name" --network "$NETWORK" 2>/dev/null || true
done
DEPLOYER=$(stellar keys address kolektibo-deployer)
OFFICER2=$(stellar keys address kolektibo-officer2)
OFFICER3=$(stellar keys address kolektibo-officer3)
ISSUER=$(stellar keys address kolektibo-usdc-issuer)
echo "   deployer=$DEPLOYER"

echo "▶ 2/6  Building the contract (wasm)…"
stellar contract build --manifest-path "$CONTRACTS/treasury/Cargo.toml"
# Stellar CLI 27 + Rust 1.84+ target this triple; fall back to the classic one.
WASM="$CONTRACTS/target/wasm32v1-none/release/treasury.wasm"
[ -f "$WASM" ] || WASM="$CONTRACTS/target/wasm32-unknown-unknown/release/treasury.wasm"
echo "   wasm=$WASM"

echo "▶ 3/6  Ensuring the test USDC asset exists as a Stellar Asset Contract…"
# Asset->SAC id is deterministic; deploy once, reuse thereafter.
stellar contract asset deploy \
  --asset "USDC:$ISSUER" --source kolektibo-usdc-issuer --network "$NETWORK" 2>/dev/null || true
USDC_SAC=$(stellar contract id asset --asset "USDC:$ISSUER" --network "$NETWORK")
echo "   USDC SAC=$USDC_SAC"

echo "▶ 4/6  Deploying the treasury contract…"
TREASURY_ID=$(stellar contract deploy \
  --wasm "$WASM" --source kolektibo-deployer --network "$NETWORK")
echo "   treasury=$TREASURY_ID"

echo "▶ 5/6  Initializing policy (2-of-3 officers; Equipment≤5000, Venue≤3000, Refreshments≤1500)…"
stellar contract invoke --id "$TREASURY_ID" --source kolektibo-deployer --network "$NETWORK" -- \
  initialize \
  --token "$USDC_SAC" \
  --officers "[\"$DEPLOYER\",\"$OFFICER2\",\"$OFFICER3\"]" \
  --threshold 2 \
  --categories '["Equipment","Venue","Refreshments"]' \
  --limits '["50000000000","30000000000","15000000000"]'   # 5000 / 3000 / 1500 USDC * 1e7 (SCALE)

# Seed the treasury with some USDC so `execute` can make a real transfer in the demo.
echo "   Minting 20000 USDC into the treasury for the demo…"
stellar contract invoke --id "$USDC_SAC" --source kolektibo-usdc-issuer --network "$NETWORK" -- \
  mint --to "$TREASURY_ID" --amount 200000000000 || true   # 20000 * 1e7 (7 decimals)

echo "▶ 6/6  Writing apps/web/.env.local…"
cat > "$ROOT/apps/web/.env.local" <<EOF
VITE_AI_URL=http://localhost:8787
VITE_HORIZON_URL=https://horizon-testnet.stellar.org
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_TREASURY_CONTRACT_ID=$TREASURY_ID
VITE_USDC_SAC_ID=$USDC_SAC
EOF

echo ""
echo "✅ Deployed."
echo "   Treasury : $TREASURY_ID"
echo "   USDC SAC : $USDC_SAC"
echo "   Explorer : https://stellar.expert/explorer/testnet/contract/$TREASURY_ID"
