import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Send /api calls to the Express server so the browser only talks to one address.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
