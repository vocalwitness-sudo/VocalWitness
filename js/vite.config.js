import { defineConfig } from 'vite';

export default defineConfig({
  // Matches your repository name so assets load correctly on GitHub Pages
  base: '/VocalWitness/', 
  build: {
    // Target Firefox 115 (ESR) compatibility
    target: 'firefox115',
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: true
  }
});
