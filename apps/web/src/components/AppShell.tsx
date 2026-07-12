import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { isSupabaseEnabled } from '../lib/supabase'

type Tab = { to: string; label: string; Icon: ComponentType<{ className?: string }> }

const tabs: Tab[] = [
  { to: '/', label: 'Pool', Icon: IconHome },
  { to: '/contribute', label: 'Contribute', Icon: IconPlus },
  { to: '/spend', label: 'Spend', Icon: IconSend },
  { to: '/setup', label: 'Rules', Icon: IconGear },
]

// Full-screen auth routes hide the treasury bottom-nav (the 4-tab demo nav is otherwise untouched).
const AUTH_PATHS = ['/signin', '/signup', '/forgot-password', '/reset-password', '/verify-email']

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isAuthRoute = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const showAccount = isSupabaseEnabled() && !isAuthRoute

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper-50 shadow-2xl shadow-ink-950/10 ring-1 ring-ink-300/50">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-300/60 bg-paper-0/80 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <img src="/kolektibo.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-tight text-ink-950">Kolektibo</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-medium text-brand-700">
            Stellar Testnet
          </span>
          {showAccount && (
            <Link
              to="/profile"
              aria-label="Account"
              className="text-ink-500 transition hover:text-ink-950"
            >
              <IconUser className="h-6 w-6" />
            </Link>
          )}
        </div>
      </header>

      {/* Content */}
      <main className={`no-scrollbar flex-1 overflow-y-auto px-4 pt-4 ${isAuthRoute ? 'pb-4' : 'pb-28'}`}>
        <Outlet />
      </main>

      {/* Bottom nav */}
      {!isAuthRoute && (
        <nav
          className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-stretch justify-around border-t border-ink-300/60 bg-paper-0/90 backdrop-blur"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          {tabs.map(({ to, label, Icon }) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                  active ? 'text-brand-600' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  )
}
function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12l16-8-6 16-3-6-7-2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconGear({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7.7 1.6 1.6 0 0 0-1.1 1.5V22a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 8 20.3a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-.7-2.7 1.6 1.6 0 0 0-1.5-1.1H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.7 8a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.7a1.6 1.6 0 0 0 1.1-1.5V2a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 15 3.7a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 .7 2.7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
