import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function peso(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 0 })
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl bg-ink-800/60 p-4 ring-1 ring-white/5 backdrop-blur ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </h2>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'gold'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100'
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-900/30',
    gold: 'bg-gold-500 text-ink-950 hover:bg-gold-400',
    ghost: 'bg-white/5 text-slate-200 hover:bg-white/10 ring-1 ring-white/10',
  }
  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl bg-ink-950/60 px-3.5 py-3 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-brand-500'

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const hot = pct > 85
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${hot ? 'bg-gold-500' : 'bg-brand-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Badge({
  children,
  tone = 'brand',
}: {
  children: ReactNode
  tone?: 'brand' | 'gold' | 'slate' | 'green'
}) {
  const tones = {
    brand: 'bg-brand-600/15 text-brand-400 ring-brand-500/30',
    gold: 'bg-gold-500/15 text-gold-400 ring-gold-500/30',
    slate: 'bg-white/5 text-slate-400 ring-white/10',
    green: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
