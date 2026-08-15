import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './',

  plugins: [
    tailwindcss(),
  ],

  build: {
    outDir: 'public',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    
    // Multi-page entry points
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
      },
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: ({ name }) => {
          if (/\.(wasm)$/i.test(name ?? '')) {
            return 'assets/wasm/[name][extname]';
          }
          if (/\.(zkey|r1cs)$/i.test(name ?? '')) {
            return 'assets/zk/[name][extname]';
          }
          return 'assets/[ext]/[name]-[hash][extname]';
        }
      }
    }
  },

  // Web Worker bundling for ZK proofs
  worker: {
    format: 'es',
    plugins: []
  },

  assetsInclude: ['**/*.wasm', '**/*.zkey', '**/*.r1cs'],

  // Local dev server headers for SharedArrayBuffer / WASM execution
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Access-Control-Allow-Origin': '*'
    }
  },

  preview: {
    port: 5000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  optimizeDeps: {
    exclude: ['snarkjs']
  }
});
