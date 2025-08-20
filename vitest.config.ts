import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.spec.ts',
        'src/websocket-polyfill.ts',
        'src/example.ts',
        'src/main.ts',
        'src/types/**',
        'src/core/interfaces/**',
        'vitest.config.ts',
        'src/metatell-bot.ts',
        'src/metatell-client.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
