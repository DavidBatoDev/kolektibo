import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '../lib/auth'

type IconProps = { className?: string }

const PUBLIC_PATHS = ['/', '/how-it-works', '/features', '/security', '/pricing', '/about', '/help', '/status', '/legal']
const AUTH_PATHS = ['/auth', '/onboarding', '/signin', '/signup', '/forgot-password', '/reset-password', '/verify-email']

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isAuth = AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  const isDemo = pathname === '/demo' || pathname.startsWith('/demo/')
  const isInvite = pathname.startsWith('/invite/') || pathname.startsWith('/join/')
  const isPublic = !isAuth && !isDemo && !isInvite && PUBLIC_PATHS.some((path) => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))

  if (pathname === '/') return <Outlet />
  if (isPublic) return <PublicShell />
  if (isAuth || isInvite) return <FocusShell />
  if (isDemo) return <DemoShell />
  return <ProductShell />
}

/** Public reading pages use the same phone frame as the member product. */
function PublicShell() {
  const { user } = useAuth()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ink-900/50 shadow-2xl shadow-black/40 ring-1 ring-ink-200">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-ink-950/85 px-4 py-3 backdrop-blur">
        <Brand />
        <Link to={user ? '/app' : '/auth/sign-in'} className="text-sm text-ink-700 hover:text-ink-950">{user ? 'Open app' : 'Sign in'}</Link>
      </header>
      <main className="flex-1 px-4"><Outlet /></main>
      <footer className="border-t border-white/5 px-4 py-7 text-xs text-ink-500">
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ink-900/50 shadow-2xl shadow-black/40 ring-1 ring-ink-200">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3"><Brand /><span className="rounded-full bg-paper-100 px-2 py-1 text-[10px] text-ink-500 ring-1 ring-ink-200">Testnet beta</span></header>
      <main className="flex-1 px-4 py-4"><Outlet /></main>
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ink-900/60 shadow-2xl shadow-black/40 ring-1 ring-ink-200">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-4 py-3 backdrop-blur"><Brand to="/demo" /><div className="flex items-center gap-2"><span className="rounded-full bg-gold-500/15 px-2 py-1 text-[10px] font-medium text-gold-400 ring-1 ring-gold-500/30">Demo</span><Link to="/" aria-label="Leave demo" className="text-xs text-ink-500 hover:text-ink-950">Exit</Link></div></header>
      <main className="no-scrollbar flex-1 overflow-y-auto px-4 pb-28 pt-4"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-white/5 bg-ink-950/90 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {tabs.map(({ to, label, Icon }) => { const active = to === '/demo' ? pathname === to : pathname.startsWith(to); return <Link key={to} to={to} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? 'text-brand-400' : 'text-ink-500'}`}><Icon className="h-5 w-5" />{label}</Link> })}
      </nav>
    </div>
  )
}

function ProductShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const { user } = useAuth()
  useEffect(() => {
    if (!user || pathname.startsWith('/invite/')) return
    const code = localStorage.getItem('kolektibo.join.pending')
    if (code) void navigate({ to: '/invite/$code', params: { code } })
  }, [user, pathname, navigate])
  const nav = [
    { to: '/app', label: 'Home', Icon: IconHome, exact: true },
    { to: '/app/pools', label: 'Pools', Icon: IconUsers, exact: false },
    { to: '/app/activity', label: 'Activity', Icon: IconActivity, exact: false },
    { to: '/app/wallet', label: 'Wallet', Icon: IconWallet, exact: false },
    { to: '/app/profile', label: 'More', Icon: IconMenu, exact: false },
  ] as const
  const active = (to: string, exact?: boolean) => exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col shadow-2xl shadow-black/10 ring-1 ring-ink-300/50">
      <header className="sticky top-0 z-20 border-b border-ink-300/60 bg-white/85 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3"><Brand to="/app" theme="light" /><div className="flex items-center gap-3"><span className="rounded-full bg-brand-100 px-2 py-1 text-[10px] text-brand-700 ring-1 ring-brand-500/30">Testnet</span><Link to="/app/notifications" aria-label="Notifications" className="text-ink-500 hover:text-ink-900"><IconBell className="h-5 w-5" /></Link></div></div>
      </header>
      <main className="min-w-0 flex-1 px-4 pb-28 pt-5"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md border-t border-ink-300/60 bg-white/92 backdrop-blur" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {nav.map(({ to, label, Icon, exact }) => <Link key={to} to={to} className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition ${active(to, exact) ? 'text-brand-600' : 'text-ink-500 hover:text-ink-700'}`}><Icon className="h-5 w-5" />{label}</Link>)}
      </nav>
    </div>
  )
}

function Brand({ to = '/', theme = 'dark' }: { to?: '/' | '/app' | '/demo', theme?: 'dark' | 'light' }) {
  return <Link to={to} className="flex items-center gap-2"><img src="/kolektibo.svg" alt="" className="h-7 w-7" /><span className={`text-lg font-semibold tracking-tight ${theme === 'light' ? 'text-ink-950' : 'text-ink-950'}`}>Kolektibo</span></Link>
}

function SvgIcon({ className, children }: IconProps & { children: React.ReactNode }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg> }
function IconHome(props: IconProps) { return <SvgIcon {...props}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></SvgIcon> }
function IconPlus(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></SvgIcon> }
function IconSend(props: IconProps) { return <SvgIcon {...props}><path d="M4 12l16-8-6 16-3-6-7-2z" /></SvgIcon> }
function IconGear(props: IconProps) { return <SvgIcon {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></SvgIcon> }
function IconUsers(props: IconProps) { return <SvgIcon {...props}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c0-3 2.4-5 5.5-5s5.5 2 5.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c2.7.3 4.5 2 4.5 5" /></SvgIcon> }
function IconActivity(props: IconProps) { return <SvgIcon {...props}><path d="M4 17l5-5 3 3 7-8" /><path d="M15 7h4v4" /></SvgIcon> }
function IconWallet(props: IconProps) { return <SvgIcon {...props}><path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" /></SvgIcon> }
function IconMenu(props: IconProps) { return <SvgIcon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></SvgIcon> }
function IconBell(props: IconProps) { return <SvgIcon {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></SvgIcon> }
