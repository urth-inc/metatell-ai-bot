import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        'node_modules/**',
        'packages/*/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types/**',
        '**/test-utils/**',
        '**/*.d.ts',
      ],
    },
    include: [
      'packages/*/src/**/*.{test,spec}.ts',
      'packages/*/tests/e2e/**/*.test.ts',
      'test-utils/**/*.{test,spec}.ts',
    ],
  },
  resolve: {
    alias: {
      '@metatell/bot-sdk': path.resolve(__dirname, './packages/sdk/src'),
      '@metatell/bot-core': path.resolve(__dirname, './packages/core/src'),
    },
  },
})
