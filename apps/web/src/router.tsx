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
import { PoolDetailPage } from './routes/PoolDetail'
import { PoolInvitePage } from './routes/PoolInvite'
import { PoolContributePage } from './routes/PoolContribute'
import { PoolSpendPage } from './routes/PoolSpend'
import { JoinPage } from './routes/Join'
import { requireAuth, requireProductionAuth, requireProductionFeatures } from './lib/authGuard'
import { supabase } from './lib/supabase'
import { LandingPage } from './routes/LandingPage'
import {
  HelpArticlePage,
  HelpPage,
  LegalPage,
  PublicInfoPage,
  StatusPage,
} from './routes/Public'
import { AppDashboardPage } from './routes/AppDashboard'
import { AgentPage } from './routes/Agent'
import {
  AppActivityPage,
  AppHelpPage,
  DataPrivacyPage,
  NotificationsPage,
  PreferencesPage,
  SecurityPage,
} from './routes/AppPages'
import { PoolWizardPage } from './routes/PoolWizard'
import {
  PoolActivityPage,
  PoolApprovalsPage,
  PoolContributionsPage,
  PoolGoalsPage,
  PoolMembersPage,
  PoolPayeesPage,
  PoolReportsPage,
  PoolRulesPage,
  PoolSettingsPage,
  PoolSpendsPage,
  SpendDetailPage,
} from './routes/PoolWorkspace'
import {
  OnboardingCompletePage,
  OnboardingProfilePage,
  OnboardingRecoveryPage,
  OnboardingWalletPage,
} from './routes/Onboarding'

const rootRoute = createRootRoute({ component: AppShell })
const requireProduct = requireProductionFeatures('production_shell')
const requirePools = requireProductionFeatures('production_shell', 'multi_pool')
const requirePoolWizard = requireProductionFeatures('production_shell', 'multi_pool', 'pool_wizard_v1')

// Public product site.
const landingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: LandingPage })
const howRoute = createRoute({ getParentRoute: () => rootRoute, path: '/how-it-works', component: () => <PublicInfoPage page="how-it-works" /> })
const featuresRoute = createRoute({ getParentRoute: () => rootRoute, path: '/features', component: () => <PublicInfoPage page="features" /> })
const publicSecurityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/security', component: () => <PublicInfoPage page="security" /> })
const pricingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pricing', component: () => <PublicInfoPage page="pricing" /> })
const aboutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/about', component: () => <PublicInfoPage page="about" /> })
const helpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/help', component: HelpPage })
const helpArticleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/help/$article', component: HelpArticlePage })
const statusRoute = createRoute({ getParentRoute: () => rootRoute, path: '/status', component: StatusPage })
const termsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/legal/terms', component: () => <LegalPage document="terms" /> })
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/legal/privacy', component: () => <LegalPage document="privacy" /> })
const riskRoute = createRoute({ getParentRoute: () => rootRoute, path: '/legal/risk', component: () => <LegalPage document="risk" /> })

// The hackathon scenario is preserved explicitly as a demo, never as a production fallback.
const demoRoute = createRoute({ getParentRoute: () => rootRoute, path: '/demo', component: HomePage })
const demoContributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/demo/contribute', component: ContributePage })
const demoSpendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/demo/spend', component: SpendPage })
const demoRulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/demo/rules', component: SetupPage })

// Public authentication routes.
const signinRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/sign-in', component: SignInPage })
const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/sign-up', component: SignUpPage })
const forgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/forgot-password', component: ForgotPasswordPage })
const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/reset-password', component: ResetPasswordPage })
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/verify-email',
  component: VerifyEmailPage,
  beforeLoad: async () => {
    if (!supabase) throw redirect({ to: '/auth/sign-in' })
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/auth/sign-in' })
    const { data: profile } = await supabase.from('profiles').select('is_email_verified').eq('id', data.session.user.id).single()
    if (profile?.is_email_verified) throw redirect({ to: '/app' })
  },
})

// Public invitation preview. The old /join path remains an alias during migration.
const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/invite/$code', component: JoinPage })
const joinAliasRoute = createRoute({ getParentRoute: () => rootRoute, path: '/join/$code', component: JoinPage })

const onboardingProfileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding/profile', component: OnboardingProfilePage, beforeLoad: requireProductionAuth })
const onboardingWalletRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding/wallet', component: OnboardingWalletPage, beforeLoad: requireProductionAuth })
const onboardingRecoveryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding/recovery', component: OnboardingRecoveryPage, beforeLoad: requireProductionAuth })
const onboardingCompleteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding/complete', component: OnboardingCompletePage, beforeLoad: requireProductionAuth })

// Authenticated product workspace.
const appRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app', component: AppDashboardPage, beforeLoad: requireProduct })
const appAgentRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/agent', component: AgentPage, beforeLoad: requireProduct })
const appActivityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/activity', component: AppActivityPage, beforeLoad: requireProduct })
const appNotificationsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/notifications', component: NotificationsPage, beforeLoad: requireProduct })
const appWalletRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/wallet', component: WalletPage, beforeLoad: requireProduct })
const appProfileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/profile', component: ProfilePage, beforeLoad: requireProduct })
const appPreferencesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/preferences', component: PreferencesPage, beforeLoad: requireProduct })
const appSecurityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/security', component: SecurityPage, beforeLoad: requireProduct })
const appDataRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/data', component: DataPrivacyPage, beforeLoad: requireProduct })
const appHelpRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/help', component: AppHelpPage, beforeLoad: requireProduct })
const appPoolsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools', component: PoolsPage, beforeLoad: requirePools })
const appPoolNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/new', component: PoolWizardPage, beforeLoad: requirePoolWizard })
const appPoolRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId', component: PoolDetailPage, beforeLoad: requirePools })
const appPoolActivityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/activity', component: PoolActivityPage, beforeLoad: requirePools })
const appPoolContributionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/contributions', component: PoolContributionsPage, beforeLoad: requirePools })
const appPoolContributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/contribute', component: PoolContributePage, beforeLoad: requirePools })
const appPoolSpendsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/spends', component: PoolSpendsPage, beforeLoad: requirePools })
const appPoolSpendNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/spends/new', component: PoolSpendPage, beforeLoad: requirePools })
const appPoolSpendDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/spends/$spendId', component: SpendDetailPage, beforeLoad: requirePools })
const appPoolApprovalsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/approvals', component: PoolApprovalsPage, beforeLoad: requirePools })
const appPoolMembersRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/members', component: PoolMembersPage, beforeLoad: requirePools })
const appPoolInvitesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/invites', component: PoolInvitePage, beforeLoad: requirePools })
const appPoolPayeesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/payees', component: PoolPayeesPage, beforeLoad: requirePools })
const appPoolGoalsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/goals', component: PoolGoalsPage, beforeLoad: requirePools })
const appPoolRulesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/rules', component: PoolRulesPage, beforeLoad: requirePools })
const appPoolReportsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/reports', component: PoolReportsPage, beforeLoad: requirePools })
const appPoolGeneralRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/settings/general', component: () => <PoolSettingsPage section="general" />, beforeLoad: requirePools })
const appPoolContributionSettingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/settings/contributions', component: () => <PoolSettingsPage section="contributions" />, beforeLoad: requirePools })
const appPoolGovernanceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/settings/governance', component: () => <PoolSettingsPage section="governance" />, beforeLoad: requirePools })
const appPoolSecurityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/settings/security', component: () => <PoolSettingsPage section="security" />, beforeLoad: requirePools })
const appPoolArchiveRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app/pools/$poolId/settings/archive', component: () => <PoolSettingsPage section="archive" />, beforeLoad: requirePools })

// Compatibility aliases for existing links and saved bookmarks. These retain the
// product shell while components migrate to /app paths.
const legacySigninRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: SignInPage })
const legacySignupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: SignUpPage })
const legacyForgotRoute = createRoute({ getParentRoute: () => rootRoute, path: '/forgot-password', component: ForgotPasswordPage })
const legacyResetRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reset-password', component: ResetPasswordPage })
const legacyVerifyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/verify-email', component: VerifyEmailPage })
const legacyProfileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profile', component: ProfilePage, beforeLoad: requireAuth })
const legacyWalletRoute = createRoute({ getParentRoute: () => rootRoute, path: '/wallet', component: WalletPage, beforeLoad: requireAuth })
const legacyPoolsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools', component: PoolsPage, beforeLoad: requireAuth })
const legacyPoolNewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/new', component: PoolWizardPage, beforeLoad: requireAuth })
const legacyPoolRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId', component: PoolDetailPage, beforeLoad: requireAuth })
const legacyPoolInviteRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/invite', component: PoolInvitePage, beforeLoad: requireAuth })
const legacyPoolContributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/contribute', component: PoolContributePage, beforeLoad: requireAuth })
const legacyPoolSpendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/pools/$poolId/spend', component: PoolSpendPage, beforeLoad: requireAuth })
const legacyContributeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/contribute', beforeLoad: () => { throw redirect({ to: '/demo/contribute' }) } })
const legacySpendRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spend', beforeLoad: () => { throw redirect({ to: '/demo/spend' }) } })
const legacySetupRoute = createRoute({ getParentRoute: () => rootRoute, path: '/setup', beforeLoad: () => { throw redirect({ to: '/demo/rules' }) } })

const routeTree = rootRoute.addChildren([
  landingRoute, howRoute, featuresRoute, publicSecurityRoute, pricingRoute, aboutRoute, helpRoute,
  helpArticleRoute, statusRoute, termsRoute, privacyRoute, riskRoute,
  demoRoute, demoContributeRoute, demoSpendRoute, demoRulesRoute,
  signinRoute, signupRoute, forgotRoute, resetRoute, verifyEmailRoute,
  inviteRoute, joinAliasRoute, onboardingProfileRoute, onboardingWalletRoute,
  onboardingRecoveryRoute, onboardingCompleteRoute,
  appRoute, appAgentRoute, appActivityRoute, appNotificationsRoute, appWalletRoute, appProfileRoute,
  appPreferencesRoute, appSecurityRoute, appDataRoute, appHelpRoute, appPoolsRoute,
  appPoolNewRoute, appPoolRoute, appPoolActivityRoute, appPoolContributionsRoute,
  appPoolContributeRoute, appPoolSpendsRoute, appPoolSpendNewRoute, appPoolSpendDetailRoute,
  appPoolApprovalsRoute, appPoolMembersRoute, appPoolInvitesRoute, appPoolPayeesRoute,
  appPoolGoalsRoute, appPoolRulesRoute, appPoolReportsRoute, appPoolGeneralRoute,
  appPoolContributionSettingsRoute, appPoolGovernanceRoute, appPoolSecurityRoute, appPoolArchiveRoute,
  legacySigninRoute, legacySignupRoute, legacyForgotRoute, legacyResetRoute, legacyVerifyRoute,
  legacyProfileRoute, legacyWalletRoute, legacyPoolsRoute, legacyPoolNewRoute, legacyPoolRoute,
  legacyPoolInviteRoute, legacyPoolContributeRoute, legacyPoolSpendRoute, legacyContributeRoute,
  legacySpendRoute, legacySetupRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}
