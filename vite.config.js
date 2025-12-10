import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        // When running locally:
        // 1. Run `vercel dev` in one terminal (serves API on port 3000)
        // 2. Run `npm run dev` in another terminal (serves frontend with proxy)
      }
    }
  }
})
