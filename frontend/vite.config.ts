import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset base. Harmless for the dev server (assets still resolve from
  // the current URL); mainly matters for `vite build` when not served from the
  // domain root.
  base: './',
  plugins: [react()],
  server: {
    // Host on all network interfaces so the app is reachable from other
    // devices on the LAN via http://<your-lan-ip>:5173
    host: '0.0.0.0',
    port: 5173,
  },
})
