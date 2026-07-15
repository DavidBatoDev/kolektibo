// Client-side record of the transaction hash behind each on-chain action, so the
// UI can link every contribution / request / approval / release to stellar.expert.
// (The chain is the source of truth; this is just a convenience map hash-by-action.)
const KEY = 'kolektibo.txlog.v1'

type TxLog = Record<string, string>

export type LocalTxEvent = {
  contract_id: string
  event_type: 'spend_req' | 'approve' | 'execute'
  tx_hash: string
  occurred_at: string
  payload: Record<string, string | number>
}

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

/** Best-effort activity fallback for the no-Supabase demo. */
export function getTxLogEvents(contractIds: string[] = []): LocalTxEvent[] {
  const wanted = new Set(contractIds)
  return Object.entries(load()).flatMap(([key, tx_hash], index) => {
    const match = key.match(/^([^:]+):spend:(\d+):(request|approve|execute)(?::(.+))?$/)
    if (!match) return []
    const [, contract_id, spendId, action, actor] = match
    if (wanted.size > 0 && !wanted.has(contract_id)) return []
    const event_type: LocalTxEvent['event_type'] = action === 'request'
      ? 'spend_req'
      : action as 'approve' | 'execute'
    return [{
      contract_id,
      event_type,
      tx_hash,
      occurred_at: new Date(Date.now() - index * 1000).toISOString(),
      payload: {
        spend_id: Number(spendId),
        ...(event_type === 'spend_req' ? { id: Number(spendId) } : {}),
        ...(event_type === 'approve' && actor ? { officer: actor } : {}),
      },
    } satisfies LocalTxEvent]
  }).reverse()
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
