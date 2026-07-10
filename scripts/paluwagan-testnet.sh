#!/usr/bin/env bash
# Deploy the paluwagan contract to testnet and run a full rotation with 3 real
# members, verifying the zero-sum invariant on-chain. Also exercises the
# trustline-on-payout requirement (recipients must trust USDC to receive it).
#   Usage: bash scripts/paluwagan-testnet.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$HERE/env.sh"

NET=testnet
USDC=CDTCIZLKSZNDFDSZRQUFIHQ5P5L2OOI5DDOMSY5NH6NQQTGSOE5LK7QR
ISSUER=$(stellar keys address kolektibo-usdc-issuer)
CONTRIB=1000000000        # 100 USDC (7 decimals)
MINT=10000000000          # 1000 USDC start per member

echo "▶ 1/5 build + deploy paluwagan"
stellar contract build --manifest-path "$ROOT/contracts/paluwagan/Cargo.toml" >/dev/null 2>&1
WASM="$ROOT/contracts/target/wasm32v1-none/release/paluwagan.wasm"
PAL=$(stellar contract deploy --wasm "$WASM" --source kolektibo-deployer --network "$NET" 2>/dev/null)
echo "   paluwagan=$PAL"

echo "▶ 2/5 set up 3 members (fund + USDC trustline + mint)"
for i in 1 2 3; do
  stellar keys generate "pal-m$i" --network "$NET" --fund >/dev/null 2>&1 || stellar keys fund "pal-m$i" --network "$NET" >/dev/null 2>&1 || true
  A=$(stellar keys address "pal-m$i")
  stellar tx new change-trust --source "pal-m$i" --line "USDC:$ISSUER" --network "$NET" >/dev/null 2>&1 || true
  stellar contract invoke --id "$USDC" --source kolektibo-usdc-issuer --network "$NET" -- mint --to "$A" --amount "$MINT" >/dev/null 2>&1
done
M1=$(stellar keys address pal-m1); M2=$(stellar keys address pal-m2); M3=$(stellar keys address pal-m3)
echo "   members ready"

echo "▶ 3/5 initialize (3 members, 100 USDC/cycle)"
stellar contract invoke --id "$PAL" --source kolektibo-deployer --network "$NET" -- \
  initialize --token "$USDC" --members "[\"$M1\",\"$M2\",\"$M3\"]" --contribution "$CONTRIB" >/dev/null 2>&1

echo "▶ 4/5 run full rotation (3 cycles)"
for cycle in 0 1 2; do
  for m in pal-m1 pal-m2 pal-m3; do
    A=$(stellar keys address "$m")
    stellar contract invoke --id "$PAL" --source "$m" --network "$NET" -- contribute --from "$A" >/dev/null 2>&1
  done
  stellar contract invoke --id "$PAL" --source kolektibo-deployer --network "$NET" -- advance_cycle >/dev/null 2>&1
  echo "   cycle $cycle paid out to members[$cycle]"
done

echo "▶ 5/5 verify"
echo -n "   is_complete = "; stellar contract invoke --id "$PAL" --source kolektibo-deployer --network "$NET" -- is_complete 2>/dev/null
echo -n "   contract balance (raw, want 0) = "; stellar contract invoke --id "$PAL" --source kolektibo-deployer --network "$NET" -- get_balance 2>/dev/null
for m in pal-m1 pal-m2 pal-m3; do
  A=$(stellar keys address "$m")
  echo -n "   $m USDC (raw, want $MINT) = "; stellar contract invoke --id "$USDC" --source kolektibo-deployer --network "$NET" -- balance --id "$A" 2>/dev/null
done
echo "PALUWAGAN_CONTRACT=$PAL"
echo "=== PALUWAGAN TESTNET DONE ==="