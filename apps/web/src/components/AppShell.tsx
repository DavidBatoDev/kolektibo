import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useNotificationsRealtime, useUnreadNotificationCount } from '../hooks/useNotifications'

type IconProps = { className?: string }

const PUBLIC_PATHS = ['/', '/how-it-works', '/features', '/security', '/pricing', '/about', '/help', '/status', '/legal']
const AUTH_PATHS = ['/auth', '/signin', '/signup', '/forgot-password', '/reset-password', '/verify-email']
const ONBOARDING_PATHS = ['/onboarding']

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isAuth = AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const isOnboarding = ONBOARDING_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const isDemo = pathname === '/demo' || pathname.startsWith('/demo/')
  const isInvite = pathname.startsWith('/invite/') || pathname.startsWith('/join/')
  const isPublic = !isAuth && !isDemo && !isInvite && PUBLIC_PATHS.some((path) => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))

  if (pathname === '/') return <main><Outlet /></main>
  if (isPublic) return <PublicShell />
  if (isAuth || isOnboarding) return <AuthShell />
  if (isInvite) return <FocusShell />
  if (isDemo) return <DemoShell />
  return <ProductShell />
}

function AuthShell() {
  return (
    <div className="auth-shell mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="auth-nav">
        <div className="auth-nav-inner">
          <Brand />
          <div className="auth-nav-actions">
            <span className="auth-testnet"><span />Testnet beta</span>
          </div>
        </div>
      </header>
      <main className="auth-main">
        <Outlet />
      </main>
    </div>
  )
}

/** Public reading pages use the same phone frame as the member product. */
function PublicShell() {
  const { user } = useAuth()
  return (
    <div className="product-shell mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="product-header sticky top-0 z-20 flex items-center justify-between border-b border-ink-300/60 px-4 py-3 backdrop-blur">
        <Brand />
        <Link to={user ? '/app' : '/auth/sign-in'} className="text-sm text-ink-700 hover:text-ink-950">{user ? 'Open app' : 'Sign in'}</Link>
      </header>
      <main className="product-main flex-1 px-4"><Outlet /></main>
      <footer className="relative z-10 border-t border-ink-300/60 bg-paper-0/80 px-4 py-7 text-xs text-ink-500 backdrop-blur">
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2"><p className="font-medium text-ink-950">Product</p><Link to="/about" className="block hover:text-ink-700">About</Link><Link to="/help" className="block hover:text-ink-700">Help</Link><Link to="/status" className="block hover:text-ink-700">Status</Link></div>
          <div className="space-y-2"><p className="font-medium text-ink-950">Legal</p><Link to="/legal/terms" className="block hover:text-ink-700">Terms</Link><Link to="/legal/privacy" className="block hover:text-ink-700">Privacy</Link><Link to="/legal/risk" className="block hover:text-ink-700">Risk</Link></div>
        </div>
      </footer>
    </div>
  )
}

function FocusShell() {
  return (
    <div className="product-shell mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="product-header relative z-20 flex items-center justify-between border-b border-ink-300/60 px-4 py-3"><Brand /><span className="rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-500/20">Testnet beta</span></header>
      <main className="product-main flex-1 px-4 py-4"><Outlet /></main>
    </div>
  )
}

function DemoShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const tabs = [
    { to: '/demo', label: 'Pool', Icon: IconHome },
    { to: '/demo/contribute', label: 'Contribute', Icon: IconPlus },
    { to: '/demo/spend', label: 'Spend', Icon: IconSend },
    { to: '/demo/rules', label: 'Rules', Icon: IconGear },
  ] as const
  return (
    <div className="demo-shell product-shell mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="product-header sticky top-0 z-20 border-b border-ink-300/60 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand to="/demo" />
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-300/25 px-2.5 py-1 text-[10px] font-semibold text-gold-700 ring-1 ring-gold-400/25">
              <span className="size-1.5 rounded-full bg-gold-400" />Interactive demo
            </span>
            <Link to="/" aria-label="Leave demo" className="product-header-icon">
              <IconExit className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>
      <main className="product-main no-scrollbar min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-5"><Outlet /></main>
      <nav className="product-nav fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-ink-300/60 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {tabs.map(({ to, label, Icon }) => {
          const active = to === '/demo' ? pathname === to : pathname.startsWith(to)
          return (
            <Link key={to} to={to} className={`product-nav-item flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${active ? 'is-active text-brand-700' : 'text-ink-500 hover:text-ink-700'}`}>
              <span className="product-nav-icon"><Icon className="h-[18px] w-[18px]" /></span>
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

function ProductShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useI18n()
  useNotificationsRealtime()
  const unread = useUnreadNotificationCount()
  useEffect(() => {
    if (!user || pathname.startsWith('/invite/')) return
    const code = localStorage.getItem('kolektibo.join.pending')
    if (code) void navigate({ to: '/invite/$code', params: { code } })
  }, [user, pathname, navigate])
  const nav = [
    { to: '/app', label: t('nav.home'), Icon: IconHome, exact: true },
    { to: '/app/pools', label: t('nav.pools'), Icon: IconUsers, exact: false },
    { to: '/app/agent', label: t('nav.agent'), Icon: IconSpark, exact: false },
    { to: '/app/wallet', label: t('nav.wallet'), Icon: IconWallet, exact: false },
    { to: '/app/profile', label: t('nav.more'), Icon: IconMenu, exact: false },
  ] as const
  const active = (to: string, exact?: boolean) => exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  return (
    <div className="product-shell mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="product-header sticky top-0 z-20 border-b border-ink-300/60 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3"><Brand to="/app" /><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-[10px] font-semibold text-brand-700 ring-1 ring-brand-500/25"><span className="size-1.5 rounded-full bg-brand-500" />{t('common.testnet')}</span><Link to="/app/notifications" aria-label={t('nav.notifications')} className="product-header-icon relative"><IconBell className="h-5 w-5" />{!!unread.data && <span className="absolute -right-0.5 -top-0.5 flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-600 px-1 text-[8px] font-bold leading-none text-white">{unread.data > 99 ? '99+' : unread.data}</span>}</Link></div></div>
      </header>
      <main className="product-main min-w-0 flex-1 px-4 pb-28 pt-5"><Outlet /></main>
      <nav className="product-nav fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-ink-300/60 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {nav.map(({ to, label, Icon, exact }) => { const isActive = active(to, exact); return <Link key={to} to={to} className={`product-nav-item flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${isActive ? 'is-active text-brand-700' : 'text-ink-500 hover:text-ink-700'}`}><span className="product-nav-icon"><Icon className="h-[18px] w-[18px]" /></span>{label}</Link> })}
      </nav>
    </div>
  )
}

function Brand({ to = '/' }: { to?: '/' | '/app' | '/demo' }) {
  return <Link to={to} className="app-brand flex items-center gap-2"><img src="/assets/kolektibo.svg" alt="" className="h-7 w-7" /><span className="text-lg font-semibold tracking-tight text-ink-950">Kolektibo</span></Link>
}

function SvgIcon({ className, children }: IconProps & { children: React.ReactNode }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg> }
function IconHome(props: IconProps) { return <SvgIcon {...props}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></SvgIcon> }
function IconPlus(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></SvgIcon> }
function IconSend(props: IconProps) { return <SvgIcon {...props}><path d="M4 12l16-8-6 16-3-6-7-2z" /></SvgIcon> }
function IconGear(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></SvgIcon> }
function IconUsers(props: IconProps) { return <SvgIcon {...props}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c2.7.3 4.5 2 4.5 5" /></SvgIcon> }
function IconActivity(props: IconProps) { return <SvgIcon {...props}><path d="M4 17l5-5 3 3 7-8" /><path d="M15 7h4v4" /></SvgIcon> }
function IconSpark(props: IconProps) { return <SvgIcon {...props}><path d="M12 2c.8 4.7 3.3 7.2 8 8-4.7.8-7.2 3.3-8 8-.8-4.7-3.3-7.2-8-8 4.7-.8 7.2-3.3 8-8Z" /><path d="M19 17c.3 1.7 1.3 2.7 3 3-1.7.3-2.7 1.3-3 3-.3-1.7-1.3-2.7-3-3 1.7-.3 2.7-1.3 3-3Z" /></SvgIcon> }
function IconWallet(props: IconProps) { return <SvgIcon {...props}><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" /></SvgIcon> }
function IconMenu(props: IconProps) { return <SvgIcon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></SvgIcon> }
function IconBell(props: IconProps) { return <SvgIcon {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></SvgIcon> }
function IconExit(props: IconProps) { return <SvgIcon {...props}><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5M14 8l4 4-4 4M18 12H8" /></SvgIcon> }
