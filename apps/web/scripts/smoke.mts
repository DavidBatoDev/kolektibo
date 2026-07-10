// Smoke test: read live state from the deployed treasury via the generated bindings.
import { Client, networks } from '../src/contract/treasury/src/index.ts'

const client = new Client({
  contractId: networks.testnet.contractId,
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: 'https://soroban-testnet.stellar.org',
})

console.log('contract:', networks.testnet.contractId)
console.log('balance (raw):', (await client.get_balance()).result)
console.log('threshold:', (await client.get_threshold()).result)
console.log('officers:', (await client.get_officers()).result)
console.log('categories:', (await client.get_categories()).result)
console.log('members:', (await client.get_members()).result)
console.log('spends:', (await client.get_spends()).result)
