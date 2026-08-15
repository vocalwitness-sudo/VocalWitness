import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './',

  plugins: [
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, './js'),
      '/js': resolve(__dirname, './js')
    }
  },

  build: {
    outDir: 'public',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        safety: resolve(__dirname, 'safety.html'),
        terms: resolve(__dirname, 'terms.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        verify: resolve(__dirname, 'verify.html'),
        forensicLedger: resolve(__dirname, 'forensic-ledger.html'),
        myTestimonies: resolve(__dirname, 'my-testimonies.html'),
        admin: resolve(__dirname, 'admin.html'),
        trueWitness: resolve(__dirname, 'true-witness.html'),
        groups: resolve(__dirname, 'groups.html'),
        moderation: resolve(__dirname, 'moderation.html'),
        transparency: resolve(__dirname, 'transparency.html')
      }
    }
  }
});
