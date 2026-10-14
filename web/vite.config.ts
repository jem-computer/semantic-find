import { defaultClientConditions, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

// NOTE: Pleat is vendored at vendor/pleat and read from source through its
// `@pleat/source` export condition, so it needs no build step.
export default defineConfig({
  plugins: [foldkit()],
  resolve: {
    conditions: ['@pleat/source', ...defaultClientConditions],
  },
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
})
