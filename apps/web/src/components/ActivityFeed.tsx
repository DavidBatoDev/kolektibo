import type { ActivityEvent } from '../hooks/useActivityFeed'
import { useI18n } from '../lib/i18n'
import { shortAddr } from '../lib/identity'
import { explorerTxUrl } from '../lib/stellar'
import { Badge, Button, Card, EmptyState, ErrorState, List, Row, SkeletonRow, peso } from './ui'

type Props = {
  events: ActivityEvent[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  realtimeStatus?: 'idle' | 'connecting' | 'live' | 'reconnecting'
  actorNameFor?: (address: string, contractId: string) => string | undefined
  poolNameFor?: (contractId: string) => string | undefined
  showPool?: boolean
}

const SCALE = 10_000_000

function payloadOf(event: ActivityEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {}
}

function amountLabel(raw: unknown, source: ActivityEvent['source']): string {
  if (raw === undefined || raw === null || raw === '') return '—'
  const value = Number(raw)
  if (!Number.isFinite(value)) return '—'
  return peso(source === 'supabase' ? value / SCALE : value)
}

function relativeTime(value: string, locale: 'en' | 'tl'): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const ranges: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800],
    ['day', 86_400], ['hour', 3_600], ['minute', 60], ['second', 1],
  ]
  const [unit, divisor] = ranges.find(([, size]) => Math.abs(seconds) >= size) ?? ranges.at(-1)!
  return new Intl.RelativeTimeFormat(locale === 'tl' ? 'fil-PH' : 'en-PH', { numeric: 'auto' })
    .format(Math.round(seconds / divisor), unit)
}

function eventIcon(type: string): string {
  return ({ contrib: '+', spend_req: '₱', approve: '✓', execute: '→' } as Record<string, string>)[type] ?? '•'
}

export function ActivityFeed({
  events, loading, error, onRetry, hasMore, loadingMore, onLoadMore,
  realtimeStatus = 'idle', actorNameFor, poolNameFor, showPool,
}: Props) {
  const { t, locale } = useI18n()

  if (loading) {
    return <List aria-label={t('activity.loading')}>{[0, 1, 2].map((row) => <SkeletonRow key={row} />)}</List>
  }
  if (error) {
    return <Card><ErrorState message={t('activity.errorBody')} onRetry={onRetry} /></Card>
  }
  if (events.length === 0) {
    return <Card><EmptyState title={t('activity.emptyTitle')} body={t('activity.emptyBody')} /></Card>
  }

  const actorFor = (event: ActivityEvent, raw: unknown): string => {
    const address = typeof raw === 'string' ? raw : ''
    if (!address) return t('activity.actorFallback')
    return actorNameFor?.(address, event.contract_id)
      ?? (address.length > 20 ? shortAddr(address) : address)
  }

  const sentenceFor = (event: ActivityEvent): string => {
    const payload = payloadOf(event)
    if (event.event_type === 'contrib') {
      return t('activity.contributed', { actor: actorFor(event, payload.from), amount: amountLabel(payload.amount, event.source) })
    }
    if (event.event_type === 'spend_req') {
      return t('activity.requested', {
        actor: actorFor(event, payload.proposer),
        amount: amountLabel(payload.amount, event.source),
        category: String(payload.category ?? 'a spend'),
      })
    }
    if (event.event_type === 'approve') {
      return t('activity.approved', {
        actor: actorFor(event, payload.officer),
        spendId: String(payload.spend_id ?? payload.id ?? '—'),
      })
    }
    if (event.event_type === 'execute') {
      const approvals = Array.isArray(payload.approvals) ? payload.approvals.length : 0
      return t(approvals > 0 ? 'activity.releasedAfterApprovals' : 'activity.released', {
        approvals,
        amount: amountLabel(payload.amount, event.source),
        category: String(payload.category ?? 'a spend'),
      })
    }
    return t('activity.unknown', {
      actor: actorFor(event, payload.actor),
      event: event.event_type.replaceAll('_', ' '),
    })
  }

  return (
    <div className="space-y-3">
      {realtimeStatus !== 'idle' && (
        <div className="flex justify-end" aria-live="polite">
          <Badge tone={realtimeStatus === 'live' ? 'green' : 'neutral'}>
            {realtimeStatus === 'live' ? t('activity.live') : t('activity.reconnecting')}
          </Badge>
        </div>
      )}
      <List>
        {events.map((event) => {
          const pool = poolNameFor?.(event.contract_id)
          const subtitle = [showPool ? pool : undefined, relativeTime(event.occurred_at, locale)]
            .filter(Boolean).join(' · ')
          return (
            <Row
              key={`${event.contract_id}:${event.tx_hash}:${event.event_type}`}
              leading={(
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700" aria-hidden>
                  {eventIcon(event.event_type)}
                </span>
              )}
              title={<span className="whitespace-normal leading-5">{sentenceFor(event)}</span>}
              subtitle={subtitle}
              trailing={(
                <a
                  href={explorerTxUrl(event.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('common.viewTx')}
                  className="inline-flex min-h-11 items-center rounded-full px-2 font-mono text-[11px] font-semibold text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  {event.tx_hash.slice(0, 5)}… ↗
                </a>
              )}
            />
          )
        })}
      </List>
      {hasMore && onLoadMore && (
        <Button variant="secondary" className="w-full" loading={loadingMore} onClick={onLoadMore}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  )
}
