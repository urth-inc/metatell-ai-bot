#!/usr/bin/env node

/**
 * Metatell CLI - Interactive tool for bot development and testing
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { connectCommand } from './commands/connect.js'
import { inspectCommand } from './commands/inspect.js'
import { startInteractiveMode } from './commands/interactive.js'

// パッケージのバージョンを動的に取得
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
const version = packageJson.version

const program = new Command()

program
  .name('metatell-cli')
  .description('CLI tool for Metatell bot development and testing')
  .version(version)

// Connect command - Simple connection test
program
  .command('connect <url>')
  .description('Connect to a Metatell room and show basic info')
  .option('-t, --token <token>', 'Authentication token')
  .option('-d, --debug', 'Enable debug logging')
  .action(connectCommand)

// Inspect command - Room inspection
program
  .command('inspect <url>')
  .description('Inspect room state and user presence')
  .option('-t, --token <token>', 'Authentication token')
  .action(inspectCommand)

// Interactive mode (default)
program
  .command('interactive <url>')
  .alias('i')
  .description('Start interactive CLI mode')
  .option('-t, --token <token>', 'Authentication token')
  .option('-n, --name <name>', 'Bot display name', 'MetatellCLI')
  .option('-d, --debug', 'Enable debug logging')
  .action(startInteractiveMode)

// Default to interactive mode
program
  .arguments('<url>')
  .option('-t, --token <token>', 'Authentication token')
  .option('-n, --name <name>', 'Bot display name', 'MetatellCLI')
  .option('-d, --debug', 'Enable debug logging')
  .action((url, options) => {
    startInteractiveMode(url, options)
  })

program.parse()
