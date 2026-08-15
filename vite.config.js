import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // or whatever plugins you use

export default defineConfig({
  plugins: [react()],
  // add your other options here (build, server, resolve, etc.)
})
