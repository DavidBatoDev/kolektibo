import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signOut, useAuth } from '../lib/auth'
import {
  useProfile,
  useSettings,
  useUpdateProfile,
  useUpdateSettings,
  useUploadAvatar,
} from '../hooks/useProfile'
import { useDeleteAccount, useOfficerPools } from '../hooks/useAccountDeletion'
import { AppPageHero, Button, Card, Field, inputClass, SectionLabel, Sheet } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { usePushNotifications } from '../hooks/usePushNotifications'
import type { TranslationKey } from '../locales/en'

const NOTIF_ROWS: [string, TranslationKey][] = [
  ['push', 'preferences.push'],
  ['approval', 'preferences.approval'],
  ['contribution', 'preferences.contribution'],
  ['release', 'preferences.release'],
]

export function ProfilePage() {
  const { t, setLocale: setAppLocale, setCurrency: setAppCurrency } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const profileQ = useProfile()
  const settingsQ = useSettings()
  const updateProfile = useUpdateProfile()
  const updateSettings = useUpdateSettings()
  const push = usePushNotifications()
  const uploadAvatar = useUploadAvatar()
  const officerPools = useOfficerPools()
  const deleteAccount = useDeleteAccount()

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [locale, setLocale] = useState('en')
  const [currency, setCurrency] = useState('PHP')
  const [notif, setNotif] = useState<Record<string, boolean>>({})
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (profileQ.data) {
      setDisplayName(profileQ.data.display_name ?? '')
      setPhone(profileQ.data.phone ?? '')
      setLocale(profileQ.data.locale ?? 'en')
    }
  }, [profileQ.data])

  useEffect(() => {
    if (settingsQ.data) {
      setCurrency(settingsQ.data.currency_display ?? 'PHP')
      setNotif((settingsQ.data.notif_prefs as Record<string, boolean>) ?? {})
    }
  }, [settingsQ.data])

  const onSignOut = async () => {
    await signOut()
    navigate({ to: '/auth/sign-in' })
  }

  const changeNotification = async (key: string, checked: boolean) => {
    if (key !== 'push') {
      setNotif((current) => ({ ...current, [key]: checked }))
      return
    }
    try {
      if (checked) await push.enable()
      else await push.disable()
      const next = { ...notif, push: checked }
      setNotif(next)
      await updateSettings.mutateAsync({ notif_prefs: next })
    } catch {
      // The hook exposes the actionable browser/configuration error below.
    }
  }

  const avatarUrl = profileQ.data?.avatar_url
  const blockingPools = officerPools.data ?? []
  const isBlocked = blockingPools.length > 0

  return (
    <div className="space-y-5">
      <AppPageHero
        eyebrow={t('common.account')}
        title={t('profile.title')}
        body={t('profile.intro')}
        asset="/assets/members.webp"
      />
      {/* Identity + avatar */}
      <Card className="flex items-center gap-4">
        <label className="relative cursor-pointer">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-paper-100 ring-1 ring-ink-300">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl text-ink-500">
                {(displayName || user?.email || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadAvatar.mutate(f)
            }}
          />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium text-ink-950">
            {uploadAvatar.isPending ? '…' : t('profile.edit')}
          </span>
        </label>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-950">{displayName || t('profile.yours')}</p>
          <p className="truncate text-xs text-ink-500">{user?.email}</p>
        </div>
      </Card>
      {uploadAvatar.isError && (
        <p className="text-xs text-danger">{t('profile.avatarFailed')}</p>
      )}

      {/* Profile */}
      <div>
        <SectionLabel>{t('profile.section')}</SectionLabel>
        <Card className="space-y-4">
          <Field label={t('profile.displayName')}>
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label={t('profile.phone')} hint={t('common.optional')}>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63…"
            />
          </Field>
          <Field label={t('preferences.language')}>
            <select className={inputClass} value={locale} onChange={(e) => { setLocale(e.target.value); setAppLocale(e.target.value === 'tl' ? 'tl' : 'en') }}>
              <option value="en">{t('language.english')}</option>
              <option value="tl">{t('language.tagalog')}</option>
            </select>
          </Field>
          <Button
            loading={updateProfile.isPending}
            onClick={() =>
              updateProfile.mutate({ display_name: displayName, phone: phone || null, locale })
            }
          >
            {t('profile.save')}
          </Button>
          {updateProfile.isSuccess && <p className="text-xs text-brand-700">{t('common.saved')} ✓</p>}
          {updateProfile.isError && <p className="text-xs text-danger">{t('profile.saveFailed')}</p>}
        </Card>
      </div>

      {/* Settings */}
      <div>
        <SectionLabel>{t('profile.settings')}</SectionLabel>
        <Card className="space-y-4">
          <Field label={t('preferences.currency')}>
            <select
              className={inputClass}
              value={currency}
              onChange={(e) => { const next = e.target.value as 'PHP' | 'USD' | 'USDC'; setCurrency(next); setAppCurrency(next) }}
            >
              <option value="PHP">{t('currency.php')}</option>
              <option value="USD">{t('currency.usd')}</option>
              <option value="USDC">{t('currency.usdc')}</option>
            </select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('preferences.notifications')}</span>
            <div className="space-y-2">
              {NOTIF_ROWS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between">
                  <span className="text-sm text-ink-700">{t(label)}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-500"
                    checked={key === 'push' ? !!push.data?.subscribed && notif.push !== false : !!notif[key]}
                    disabled={key === 'push' && (push.isLoading || push.isChanging || !push.data?.supported || !push.data?.configured)}
                    onChange={(e) => void changeNotification(key, e.target.checked)}
                  />
                </label>
              ))}
            </div>
            {push.changeError && <p className="mt-2 text-xs text-danger">{String((push.changeError as Error).message)}</p>}
          </div>
          <Button
            loading={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({ currency_display: currency, theme: 'light', notif_prefs: notif })
            }
          >
            {t('profile.saveSettings')}
          </Button>
          {updateSettings.isSuccess && <p className="text-xs text-brand-700">{t('common.saved')} ✓</p>}
          {updateSettings.isError && <p className="text-xs text-danger">{t('profile.saveFailed')}</p>}
        </Card>
      </div>

      <button
        onClick={onSignOut}
        className="w-full py-2 text-center text-xs text-ink-500 hover:text-ink-700"
      >
        {t('profile.signOut')}
      </button>

      <div>
        <SectionLabel>{t('profile.danger')}</SectionLabel>
        <Card className="space-y-3">
          <p className="text-xs text-ink-600">
            {t('profile.deleteBody')}
          </p>
          {isBlocked ? (
            <>
              <Button variant="danger" className="w-full" disabled>
                {t('profile.delete')}
              </Button>
              <p className="text-xs text-danger">
                {t('profile.officerBlock', { pools: blockingPools.join(', ') })}
              </p>
            </>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setDeleteOpen(true)}>
              {t('profile.delete')}
            </Button>
          )}
          {deleteAccount.isError && (
            <p className="text-xs text-danger">{String((deleteAccount.error as Error).message)}</p>
          )}
        </Card>
      </div>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('profile.deleteTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            {t('profile.deleteConfirmBody')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteOpen(false)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              {t('profile.deletePermanently')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
