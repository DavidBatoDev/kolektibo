// Notification fan-out for indexed chain events. Resolves on-chain addresses to
// users via pool_members.stellar_address, writes `notifications` rows (service
// role), then pushes. Read-model only — nothing here can move money.
import { admin } from './supabaseAdmin'
import { sendPushToUsers } from './push'

const SCALE = 10_000_000 // USDC raw units → display

function pesos(rawAmount: unknown): string {
  const n = Number(rawAmount ?? 0) / SCALE
  return '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 0 })
}

export type IndexedEvent = {
  event_type: string
  payload: Record<string, unknown> | null
}

type PoolRef = { id: string; name: string; contract_id: string }
type Member = { user_id: string; role: string; stellar_address: string | null }

export async function fanOut(pool: PoolRef, event: IndexedEvent): Promise<void> {
  if (!admin) return
  try {
    const { data: members } = await admin
      .from('pool_members')
      .select('user_id, role, stellar_address')
      .eq('pool_id', pool.id)
    if (!members?.length) return

    const officers = members.filter((m) => m.role === 'officer')
    const byAddress = (addr: unknown): Member | undefined =>
      members.find((m) => m.stellar_address === addr)
    const p = event.payload ?? {}

    let recipients: Member[] = []
    let title = ''
    let body = ''
    let prefKey = 'contribution'

    switch (event.event_type) {
      case 'contrib': {
        const actor = byAddress(p.from)
        recipients = officers.filter((o) => o.user_id !== actor?.user_id)
        title = 'New contribution'
        body = `${pesos(p.amount)} contributed to ${pool.name}`
        prefKey = 'contribution'
        break
      }
      case 'spend_req': {
        // proposer/amount/category come only from get_spend enrichment. If that
        // failed the payload is just {id} — skip rather than notify the proposer
        // about their own request with a "₱0" body.
        if (p.proposer === undefined) return
        const proposer = byAddress(p.proposer)
        recipients = officers.filter((o) => o.user_id !== proposer?.user_id)
        title = 'Approval needed'
        body = `${pesos(p.amount)} for ${p.category ?? 'a spend'} in ${pool.name}`
        prefKey = 'approval'
        break
      }
      case 'approve': {
        const approver = byAddress(p.officer)
        recipients = officers.filter((o) => o.user_id !== approver?.user_id)
        title = 'Spend approved'
        body = `Spend #${p.spend_id} got another approval in ${pool.name}`
        prefKey = 'approval'
        break
      }
      case 'execute': {
        recipients = members
        title = 'Funds released'
        body = `${pesos(p.amount)} released from ${pool.name}`
        prefKey = 'release'
        break
      }
      default:
        return
    }
    if (recipients.length === 0) return

    const rows = recipients.map((r) => ({
      user_id: r.user_id,
      type: event.event_type,
      title,
      body,
      payload: { pool_id: pool.id, contract_id: pool.contract_id, ...p },
    }))
    const { error } = await admin.from('notifications').insert(rows as never[])
    if (error) console.error('[notify] insert', error)

    await sendPushToUsers(
      recipients.map((r) => r.user_id),
      { title, body, url: `/pools/${pool.id}` },
      prefKey,
    )
  } catch (e) {
    console.error('[notify]', e)
  }
}
