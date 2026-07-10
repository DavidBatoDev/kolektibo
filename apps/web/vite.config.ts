import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // stellar-sdk needs Buffer/global/process shims in the browser
    nodePolyfills({ globals: { Buffer: true, global: true, process: true } }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['kolektibo.svg'],
      manifest: {
        name: 'Kolektibo — Group Treasury',
        short_name: 'Kolektibo',
        description: 'AI-Governed Group Treasury on Stellar',
        theme_color: '#0f766e',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'kolektibo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  server: { port: 5173 },
})
