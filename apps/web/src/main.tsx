import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { AuthProvider } from './lib/auth'
import { I18nProvider } from './lib/i18n'
import { ToastProvider } from './components/ui'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
