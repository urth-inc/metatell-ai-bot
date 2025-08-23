import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'packages/*/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types/**',
        '**/test-utils/**',
        '**/*.d.ts',
        'packages/bot/src/example.ts',
        'packages/bot/src/main.ts',
        'packages/bot/src/websocket-polyfill.ts',
      ],
    },
    include: [
      'packages/*/src/**/*.{test,spec}.{js,ts}',
      'packages/*/e2e/**/*.{test,spec}.{js,ts}',
      'test-utils/**/*.{test,spec}.{js,ts}'
    ],
  },
  resolve: {
    alias: {
      '@metatell/sdk': path.resolve(__dirname, './packages/sdk/src'),
      '@metatell/bot': path.resolve(__dirname, './packages/bot/src'),
    },
  },
})
