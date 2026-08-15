// vite.config.js (Root Directory)
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        trueWitness: resolve(__dirname, 'true-witness.html'),
        forensicLedger: resolve(__dirname, 'forensic-ledger.html'),
        verify: resolve(__dirname, 'verify.html'),
        admin: resolve(__dirname, 'admin.html'),
        groups: resolve(__dirname, 'groups.html'),
        moderation: resolve(__dirname, 'moderation.html'),
        myTestimonies: resolve(__dirname, 'my-testimonies.html'),
        transparency: resolve(__dirname, 'transparency.html'),
        about: resolve(__dirname, 'about.html'),
        legal: resolve(__dirname, 'legal.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        safety: resolve(__dirname, 'safety.html'),
        terms: resolve(__dirname, 'terms.html')
      }
    }
  }
});
