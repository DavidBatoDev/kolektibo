/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_AI_URL: string
  readonly VITE_SOROBAN_RPC_URL: string
  readonly VITE_HORIZON_URL: string
  readonly VITE_TREASURY_CONTRACT_ID: string
  readonly VITE_USDC_SAC_ID: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
