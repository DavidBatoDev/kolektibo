// /pools — the signed-in user's pool directory (DB-backed, cross-device).
// The localStorage demo pool is untouched; this lists pools from pool_members.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { AppPageHero, Badge, Button, Card, inputClass } from '../components/ui'
import { usePools } from '../hooks/usePools'
import { useI18n } from '../lib/i18n'

const STATUS_TONE = {
  draft: 'gold',
  deploying: 'gold',
  active: 'green',
  migrated: 'slate',
  archived: 'slate',
} as const

export function PoolsPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const pools = usePools()
  const [joinCode, setJoinCode] = useState('')

  return (
    <div className="space-y-6 pb-6">
      <AppPageHero
        eyebrow={t('pools.eyebrow')}
        title={t('pools.title')}
        body={t('pools.intro')}
        asset="/assets/pool.webp"
      />

      {pools.isLoading && (
        <Card>
          <p className="text-sm text-ink-500">{t('pools.loading')}</p>
        </Card>
      )}

      {pools.data && pools.data.length === 0 && (
        <Card className="relative overflow-hidden py-7 pr-24">
          <img src="/assets/empty.webp" alt="" className="absolute -bottom-2 -right-2 h-24 w-24 object-contain" />
          <p className="text-sm text-ink-700">
            {t('pools.empty')}
          </p>
        </Card>
      )}

      {pools.data && pools.data.length > 0 && (
        <div className="space-y-3">
          {pools.data.map(({ role, pool }) => (
            <Link key={pool.id} to="/app/pools/$poolId" params={{ poolId: pool.id }} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[26px]">
              <Card className="flex items-center gap-3 transition hover:bg-paper-100 active:scale-[0.98]">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-100">
                  <img src="/assets/pool.webp" alt="" className="size-11 object-contain" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[16px] text-ink-950">{pool.name}</p>
                  <p className="mt-0.5 text-[13px] text-ink-700">
                    {pool.currency_label} · {t('pools.role', { role: role === 'officer' ? t('common.officer') : t('common.member') })}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[pool.status as keyof typeof STATUS_TONE] ?? 'slate'}>
                  {pool.status === 'active' ? t('common.active')
                    : pool.status === 'draft' ? t('common.draft')
                      : pool.status === 'deploying' ? t('common.deploying')
                        : pool.status === 'migrated' ? t('common.migrated')
                          : pool.status === 'archived' ? t('common.archived') : pool.status}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Button size="lg" className="w-full" onClick={() => navigate({ to: '/app/pools/new' })}>
        {t('dashboard.create')}
      </Button>

      {/* Join with a code Card matching the Figma design */}
      <Card className="relative space-y-4 overflow-hidden shadow-lift">
        <img src="/assets/invite.webp" alt="" className="pointer-events-none absolute -right-4 -top-5 h-28 w-28 object-contain opacity-80" />
        <div className="relative pr-20">
          <h2 className="text-[19px] font-bold text-ink-950">{t('pools.joinTitle')}</h2>
          <p className="mt-1 text-[14px] leading-snug text-ink-700">
            {t('pools.joinBody')}
          </p>
        </div>
        <div className="pt-2">
          <input
            className={inputClass + ' uppercase tracking-widest text-center text-lg font-mono placeholder:text-ink-300'}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="ABCD123"
          />
          <button 
            className="w-full mt-3 text-center text-[11px] font-semibold text-ink-500 uppercase tracking-widest hover:text-ink-700 transition"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (text) setJoinCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
              } catch (e) {
                // ignore clipboard errors
              }
            }}
          >
            {t('pools.paste')}
          </button>
        </div>
        <div className="pt-1">
          <Button
            size="lg"
            className="w-full"
            disabled={joinCode.length < 6}
            onClick={() => navigate({ to: '/invite/$code', params: { code: joinCode } })}
          >
            {t('pools.find')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
