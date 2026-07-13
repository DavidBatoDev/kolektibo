import { createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router'
import { AppShell } from './components/AppShell'
import { HomePage } from './routes/Home'
import { SetupPage } from './routes/Setup'
import { ContributePage } from './routes/Contribute'
import { SpendPage } from './routes/Spend'
import { SignInPage } from './routes/SignIn'
import { SignUpPage } from './routes/SignUp'
import { ForgotPasswordPage } from './routes/ForgotPassword'
import { ResetPasswordPage } from './routes/ResetPassword'
import { VerifyEmailPage } from './routes/VerifyEmail'
import { ProfilePage } from './routes/Profile'
import { WalletPage } from './routes/Wallet'
import { PoolsPage } from './routes/Pools'
import { PoolNewPage } from './routes/PoolNew'
import { PoolDetailPage } from './routes/PoolDetail'
import { PoolInvitePage } from './routes/PoolInvite'
import { PoolContributePage } from './routes/PoolContribute'
import { PoolSpendPage } from './routes/PoolSpend'
import { JoinPage } from './routes/Join'
import { requireAuth } from './lib/authGuard'
import { supabase } from './lib/supabase'

const rootRoute = createRootRoute({ component: AppShell })

// ── Treasury + account app routes: all require a signed-in, email-verified user
//    (requireAuth no-ops when Supabase is unconfigured → demo build runs guard-free). ──
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage, beforeLoad: requireAuth })
const setupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/setup', component: SetupPage, beforeLoad: requireAuth })
const contributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/contribute', component: ContributePage, beforeLoad: requireAuth })
const spendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spend', component: SpendPage, beforeLoad: requireAuth })
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profile', component: ProfilePage, beforeLoad: requireAuth })
const walletRoute = createRoute({ getParentRoute: () => rootRoute, path: '/wallet', component: WalletPage, beforeLoad: requireAuth })

// ── Multi-user pools (DB directory; gated by isSupabaseEnabled + multi_pool flag in UI) ──
const poolsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools', component: PoolsPage, beforeLoad: requireAuth })
const poolNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/new', component: PoolNewPage, beforeLoad: requireAuth })
const poolDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId', component: PoolDetailPage, beforeLoad: requireAuth })
const poolInviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/invite', component: PoolInvitePage, beforeLoad: requireAuth })
const poolContributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/contribute', component: PoolContributePage, beforeLoad: requireAuth })
const poolSpendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/spend', component: PoolSpendPage, beforeLoad: requireAuth })
// Invite landing is public: anonymous preview → signup → back here to redeem.
const joinRoute = createRoute({ getParentRoute: () => rootRoute, path: '/join/$code', component: JoinPage })

// ── Public auth routes (no guard; render full-screen without the bottom nav) ──
const signinRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: SignInPage })
const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: SignUpPage })
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/forgot-password', component: ForgotPasswordPage })
const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reset-password', component: ResetPasswordPage })

// ── Verify-email: session required, but only for the not-yet-verified (verified → home) ──
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  component: VerifyEmailPage,
  beforeLoad: async () => {
    if (!supabase) throw redirect({ to: '/signin' })
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/signin' })
    const { data: prof } = await supabase
      .from('profiles')
      .select('is_email_verified')
      .eq('id', data.session.user.id)
      .single()
    if (prof?.is_email_verified) throw redirect({ to: '/' })
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  contributeRoute,
  spendRoute,
  profileRoute,
  walletRoute,
  poolsRoute,
  poolNewRoute,
  poolDetailRoute,
  poolInviteRoute,
  poolContributeRoute,
  poolSpendRoute,
  joinRoute,
  signinRoute,
  signupRoute,
  forgotRoute,
  resetRoute,
  verifyEmailRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
