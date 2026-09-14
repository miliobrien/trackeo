import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Published on GitHub Pages under miliobrien.github.io/trackeo/, so the built
  // files are addressed from that folder. Local development stays at the root.
  base: command === 'build' ? '/trackeo/' : '/',
  // Two reasons this port is pinned. The browser keys local data to the exact
  // origin, so falling back to another port would open an app that looks
  // empty. And it is the address the sign-in link returns to during development.
  server: { port: 3000, strictPort: true },
}))
