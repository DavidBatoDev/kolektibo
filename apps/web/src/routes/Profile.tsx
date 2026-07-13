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
import { Button, Card, Field, inputClass, SectionLabel } from '../components/ui'

const NOTIF_ROWS: [string, string][] = [
  ['push', 'Push notifications'],
  ['approval', 'Approval requests'],
  ['contribution', 'Contributions'],
  ['release', 'Fund releases'],
]

export function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const profileQ = useProfile()
  const settingsQ = useSettings()
  const updateProfile = useUpdateProfile()
  const updateSettings = useUpdateSettings()
  const uploadAvatar = useUploadAvatar()

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [locale, setLocale] = useState('en')
  const [currency, setCurrency] = useState('PHP')
  const [theme, setTheme] = useState('dark')
  const [notif, setNotif] = useState<Record<string, boolean>>({})

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
      setTheme(settingsQ.data.theme ?? 'dark')
      setNotif((settingsQ.data.notif_prefs as Record<string, boolean>) ?? {})
    }
  }, [settingsQ.data])

  const onSignOut = async () => {
    await signOut()
    navigate({ to: '/auth/sign-in' })
  }

  const avatarUrl = profileQ.data?.avatar_url

  return (
    <div className="space-y-5">
      {/* Identity + avatar */}
      <Card className="flex items-center gap-4">
        <label className="relative cursor-pointer">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-ink-950 ring-1 ring-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl text-slate-500">
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
          <span className="absolute -bottom-1 -right-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {uploadAvatar.isPending ? '…' : 'edit'}
          </span>
        </label>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{displayName || 'Your profile'}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
      </Card>
      {uploadAvatar.isError && (
        <p className="text-xs text-rose-400">Avatar upload failed. Try a smaller image.</p>
      )}

      {/* Profile */}
      <div>
        <SectionLabel>Profile</SectionLabel>
        <Card className="space-y-4">
          <Field label="Display name">
            <input
              className={inputClass}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Phone" hint="Optional.">
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63…"
            />
          </Field>
          <Field label="Language">
            <select className={inputClass} value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">English</option>
              <option value="tl">Tagalog</option>
            </select>
          </Field>
          <Button
            loading={updateProfile.isPending}
            onClick={() =>
              updateProfile.mutate({ display_name: displayName, phone: phone || null, locale })
            }
          >
            Save profile
          </Button>
          {updateProfile.isSuccess && <p className="text-xs text-emerald-400">Saved ✓</p>}
          {updateProfile.isError && <p className="text-xs text-rose-400">Couldn't save. Try again.</p>}
        </Card>
      </div>

      {/* Settings */}
      <div>
        <SectionLabel>Settings</SectionLabel>
        <Card className="space-y-4">
          <Field label="Currency display">
            <select
              className={inputClass}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="PHP">₱ Philippine Peso (PHP)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="USDC">USDC</option>
            </select>
          </Field>
          <Field label="Theme">
            <select className={inputClass} value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto</option>
            </select>
          </Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Notifications</span>
            <div className="space-y-2">
              {NOTIF_ROWS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">{label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-500"
                    checked={!!notif[key]}
                    onChange={(e) => setNotif((n) => ({ ...n, [key]: e.target.checked }))}
                  />
                </label>
              ))}
            </div>
          </div>
          <Button
            loading={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({ currency_display: currency, theme, notif_prefs: notif })
            }
          >
            Save settings
          </Button>
          {updateSettings.isSuccess && <p className="text-xs text-emerald-400">Saved ✓</p>}
          {updateSettings.isError && <p className="text-xs text-rose-400">Couldn't save. Try again.</p>}
        </Card>
      </div>

      <button
        onClick={onSignOut}
        className="w-full py-2 text-center text-xs text-slate-500 hover:text-slate-300"
      >
        Sign out
      </button>
    </div>
  )
}
