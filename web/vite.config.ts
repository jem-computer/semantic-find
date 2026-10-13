import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

export default defineConfig({
  plugins: [foldkit()],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
