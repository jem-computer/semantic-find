import { defaultClientConditions, defaultServerConditions } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['@pleat/source', ...defaultClientConditions],
  },
  ssr: {
    resolve: {
      conditions: ['@pleat/source', ...defaultServerConditions],
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    // NOTE: Pleat inserts CSS through cascade layers, which happy-dom's
    // stylesheets don't support. Without a DOM, Pleat skips insertion, and
    // Scene renders without one.
    environment: 'node',
    setupFiles: ['./src/vitest-setup.ts'],
    server: {
      deps: {
        inline: [
          'foldkit',
          '@foldkit/ui',
          '@foldkit/devtools',
          '@pleat/core',
          '@pleat/foldkit',
        ],
      },
    },
  },
})
