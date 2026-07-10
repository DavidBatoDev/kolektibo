import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { AppShell } from './components/AppShell'
import { HomePage } from './routes/Home'
import { SetupPage } from './routes/Setup'
import { ContributePage } from './routes/Contribute'
import { SpendPage } from './routes/Spend'

const rootRoute = createRootRoute({ component: AppShell })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
})

const contributeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/contribute',
  component: ContributePage,
})

const spendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/spend',
  component: SpendPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  contributeRoute,
  spendRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
