// End-to-end verification of the client write path against live testnet:
// create pool → fund → trustlines → contribute → request → approve → execute.
// Uses the SAME primitives the browser app uses (bindings + basicNodeSigner).
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { basicNodeSigner } from '@stellar/stellar-sdk/contract'
import { Client } from '../src/contract/treasury/src/index.ts'

const AI = 'http://localhost:8787'
const SCALE = 10_000_000n
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')

const cfg = await (await fetch(`${AI}/config`)).json()
const passphrase: string = cfg.passphrase
const rpcUrl: string = cfg.rpcUrl
console.log('config:', { usdcSac: cfg.usdcSac, issuer: cfg.usdcIssuer })

async function friendbot(pk: string) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${pk}`)
  if (!r.ok && r.status !== 400) throw new Error(`friendbot ${r.status}`)
}

async function ensureTrustline(kp: Keypair) {
  const acct = await horizon.loadAccount(kp.publicKey())
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset('USDC', cfg.usdcIssuer) }))
    .setTimeout(60)
    .build()
  tx.sign(kp)
  await horizon.submitTransaction(tx)
}

function wc(contractId: string, kp: Keypair) {
  const s = basicNodeSigner(kp, passphrase)
  return new Client({
    contractId,
    networkPassphrase: passphrase,
    rpcUrl,
    publicKey: kp.publicKey(),
    signTransaction: s.signTransaction,
    signAuthEntry: s.signAuthEntry,
  })
}

async function post(path: string, body: unknown) {
  const r = await fetch(`${AI}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path}: ${await r.text()}`)
  return r.json()
}

const officers = [Keypair.random(), Keypair.random(), Keypair.random()]
const payee = Keypair.random()

console.log('1) fund + trustlines…')
for (const kp of [...officers, payee]) {
  await friendbot(kp.publicKey())
  await ensureTrustline(kp)
}

console.log('2) deploy pool…')
const { contractId } = await post('/pool/create', {
  officers: officers.map((o) => o.publicKey()),
  threshold: 2,
})
console.log('   pool:', contractId)

console.log('3) faucet USDC to officers…')
for (const kp of officers) await post('/faucet', { address: kp.publicKey() })

console.log('4) contribute 600 (officer0)…')
let at = await wc(contractId, officers[0]).contribute({
  from: officers[0].publicKey(),
  amount: 600n * SCALE,
})
await at.signAndSend()

console.log('5) request_spend 300 Equipment (officer0)…')
at = await wc(contractId, officers[0]).request_spend({
  proposer: officers[0].publicKey(),
  category: 'Equipment',
  amount: 300n * SCALE,
  recipient: payee.publicKey(),
  memo: 'game balls',
})
const sid = at.result
const sentReq: any = await at.signAndSend()
console.log('   spend id:', sid, ' request hash:', sentReq?.sendTransactionResponse?.hash)

console.log('6) approve (officer1) → 2 of 3…')
at = await wc(contractId, officers[1]).approve({
  officer: officers[1].publicKey(),
  spend_id: sid,
})
await at.signAndSend()

console.log('7) execute…')
at = await wc(contractId, officers[0]).execute({ spend_id: sid })
const sentExec: any = await at.signAndSend()
console.log('   execute hash:', sentExec?.sendTransactionResponse?.hash)

const rc = new Client({ contractId, networkPassphrase: passphrase, rpcUrl })
const balance = (await rc.get_balance()).result
const payeeAcct = await horizon.loadAccount(payee.publicKey())
const payeeUsdc = payeeAcct.balances.find(
  (b: any) => b.asset_code === 'USDC',
)?.balance
console.log('RESULT: pool balance raw =', balance, ' payee USDC =', payeeUsdc)
console.log(balance === 300n * SCALE && Number(payeeUsdc) === 300 ? '✅ PASS' : '⚠️ CHECK')
