import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path, // Don't rewrite the path, keep /api
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', req.method, req.url, '->', options.target + req.url);
          });
        }
      },
      '/kajabi-api': {
        target: 'https://api.kajabi.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/kajabi-api/, '')
      }
    }
  }
})
