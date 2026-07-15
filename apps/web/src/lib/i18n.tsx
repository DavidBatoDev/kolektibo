import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'
import { en, type TranslationKey } from '../locales/en'
import { tl } from '../locales/tl'

export type Locale = 'en' | 'tl'
export type DisplayCurrency = 'PHP' | 'USD' | 'USDC'
type Values = Record<string, string | number>

const LOCALE_KEY = 'kolektibo.locale'
const CURRENCY_KEY = 'kolektibo.currency'
const dictionaries = { en, tl }

type I18nValue = {
  locale: Locale
  currency: DisplayCurrency
  setLocale: (locale: Locale) => void
  setCurrency: (currency: DisplayCurrency) => void
  t: (key: TranslationKey, values?: Values) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function savedLocale(): Locale {
  const value = localStorage.getItem(LOCALE_KEY)
  return value === 'tl' ? 'tl' : 'en'
}

function savedCurrency(): DisplayCurrency {
  const value = localStorage.getItem(CURRENCY_KEY)
  return value === 'USD' || value === 'USDC' ? value : 'PHP'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [locale, setLocaleState] = useState<Locale>(savedLocale)
  const [currency, setCurrencyState] = useState<DisplayCurrency>(savedCurrency)

  const setLocale = (next: Locale) => {
    localStorage.setItem(LOCALE_KEY, next)
    setLocaleState(next)
  }
  const setCurrency = (next: DisplayCurrency) => {
    localStorage.setItem(CURRENCY_KEY, next)
    setCurrencyState(next)
  }
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    document.documentElement.dataset.currency = currency
  }, [currency])

  useEffect(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.removeItem('kolektibo.theme')
  }, [])

  useEffect(() => {
    if (!supabase || !user) return
    let active = true
    void Promise.all([
      supabase.from('profiles').select('locale').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('currency_display').eq('user_id', user.id).maybeSingle(),
    ]).then(([profile, settings]) => {
      if (!active) return
      if (profile.data?.locale === 'tl' || profile.data?.locale === 'en') setLocale(profile.data.locale)
      if (settings.data?.currency_display === 'PHP' || settings.data?.currency_display === 'USD' || settings.data?.currency_display === 'USDC') setCurrency(settings.data.currency_display)
    })
    return () => { active = false }
  }, [user?.id])

  const value = useMemo<I18nValue>(() => ({
    locale,
    currency,
    setLocale,
    setCurrency,
    t: (key, values) => {
      const template = dictionaries[locale][key] ?? en[key] ?? key
      return Object.entries(values ?? {}).reduce(
        (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
        template,
      )
    },
  }), [locale, currency])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
