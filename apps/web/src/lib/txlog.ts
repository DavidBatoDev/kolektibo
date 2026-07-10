// Client-side record of the transaction hash behind each on-chain action, so the
// UI can link every contribution / request / approval / release to stellar.expert.
// (The chain is the source of truth; this is just a convenience map hash-by-action.)
const KEY = 'kolektibo.txlog.v1'

type TxLog = Record<string, string>

function load(): TxLog {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as TxLog
  } catch {
    return {}
  }
}

export function recordTx(key: string, hash: string | undefined): void {
  if (!hash) return
  const log = load()
  log[key] = hash
  localStorage.setItem(KEY, JSON.stringify(log))
}

export function getTx(key: string): string | undefined {
  return load()[key]
}

/** Best-effort extraction of the tx hash from a SentTransaction (SDK shape varies). */
export function hashOf(sent: unknown): string {
  const s = sent as {
    sendTransactionResponse?: { hash?: string }
    getTransactionResponse?: { txHash?: string }
    hash?: string
  }
  return s?.sendTransactionResponse?.hash ?? s?.getTransactionResponse?.txHash ?? s?.hash ?? ''
}
