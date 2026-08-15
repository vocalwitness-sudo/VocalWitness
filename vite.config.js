import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        admin: resolve(__dirname, 'admin.html'),
        'forensic-ledger': resolve(__dirname, 'forensic-ledger.html'),
        groups: resolve(__dirname, 'groups.html'),
        legal: resolve(__dirname, 'legal.html'),
        'live-arena': resolve(__dirname, 'live-arena.html'),
        moderation: resolve(__dirname, 'moderation.html'),
        'my-testimonies': resolve(__dirname, 'my-testimonies.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        profile: resolve(__dirname, 'profile.html'),
        safety: resolve(__dirname, 'safety.html'),
        terms: resolve(__dirname, 'terms.html'),
        transparency: resolve(__dirname, 'transparency.html'),
        'true-witness': resolve(__dirname, 'true-witness.html'),
        verify: resolve(__dirname, 'verify.html'),
      },
    },
  },
})
