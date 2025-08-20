import { registerLoggerProvider, DefaultLoggerProvider } from './src/sdk/logging/index.js'

// Register default logger provider for all tests
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })