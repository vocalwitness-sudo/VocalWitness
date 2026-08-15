import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Automatically find every .html file in the project root
const htmlFiles = readdirSync(__dirname)
  .filter(file => file.endsWith('.html'))
  .reduce((entries, file) => {
    const name = file.replace(/\.html$/, '')
    entries[name] = resolve(__dirname, file)
    return entries
  }, {})

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: htmlFiles
    }
  }
})
