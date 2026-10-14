import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'https://localhost:7259'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Forward API calls to the backend so the auth cookie stays same-origin.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // The local ASP.NET Core development certificate is self-signed.
          secure: false,
        },
      },
    },
  }
})
