// Notification fan-out for indexed chain events. Resolves on-chain addresses to
// users via pool_members.stellar_address, writes `notifications` rows (service
// role). Supabase owns Realtime and Web Push delivery for every inserted row.
// Read-model only — nothing here can move money.
import { admin } from './supabaseAdmin'

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

    const officers = members.filter((m) => m.role === 'officer' || m.role === 'owner')
    const byAddress = (addr: unknown): Member | undefined =>
      members.find((m) => m.stellar_address === addr)
    const p = event.payload ?? {}

    let recipients: Member[] = []
    let title = ''
    let body = ''
    let url = `/app/pools/${pool.id}/activity`

    switch (event.event_type) {
      case 'contrib': {
        const actor = byAddress(p.from)
        recipients = officers.filter((o) => o.user_id !== actor?.user_id)
        title = 'New contribution'
        body = `${pesos(p.amount)} contributed to ${pool.name}`
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
        url = `/app/pools/${pool.id}/spends/${String(p.id)}`
        break
      }
      case 'approve': {
        const approver = byAddress(p.officer)
        recipients = officers.filter((o) => o.user_id !== approver?.user_id)
        title = 'Spend approved'
        body = `Spend #${p.spend_id} got another approval in ${pool.name}`
        url = `/app/pools/${pool.id}/spends/${String(p.spend_id)}`
        break
      }
      case 'execute': {
        recipients = members
        title = 'Funds released'
        body = `${pesos(p.amount)} released from ${pool.name}`
        break
      }
      case 'mand_prop': {
        recipients = officers
        title = 'Agent mandate needs approval'
        body = `A new autonomous payment rule was proposed in ${pool.name}`
        url = '/app/agent'
        break
      }
      case 'mand_appr': {
        const approver = byAddress(p.officer)
        recipients = officers.filter((o) => o.user_id !== approver?.user_id)
        title = 'Agent mandate approved'
        body = `Mandate proposal #${p.proposal_id} received an approval in ${pool.name}`
        url = '/app/agent'
        break
      }
      case 'mand_act': {
        recipients = members
        title = 'Agent mandate active'
        body = `Autonomous mandate #${p.mandate_id} is now active in ${pool.name}`
        url = '/app/agent'
        break
      }
      case 'mand_paus': {
        recipients = members
        title = 'Agent mandate paused'
        body = `Mandate #${p.mandate_id} was paused in ${pool.name}`
        url = '/app/agent'
        break
      }
      case 'mand_pay': {
        recipients = members
        title = 'Agent payment completed'
        body = `${pesos(p.amount)} paid automatically from ${pool.name}`
        url = '/app/agent'
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
      payload: { pool_id: pool.id, contract_id: pool.contract_id, url, ...p },
    }))
    const { error } = await admin.from('notifications').insert(rows as never[])
    if (error) console.error('[notify] insert', error)
  } catch (e) {
    console.error('[notify]', e)
  }
}
