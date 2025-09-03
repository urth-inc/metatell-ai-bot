#!/usr/bin/env node
import { DefaultLoggerProvider, getLogger, registerLoggerProvider } from '@metatell/sdk'
import { Command } from 'commander'
import * as v from 'valibot'
import { BotInitializer } from './BotInitializer.js'
import { startInkCli } from './cli/startInkCli.js'
import { type CliArgs, parseCliArgs } from './schemas/cli.js'
import { FileLogger } from './utils/logging/file-logger.js'

// グローバルLoggerProviderインスタンス（重複を避けるため）
let globalLoggerProvider: DefaultLoggerProvider | null = null

// Register default logger provider at startup
// Allow overwrite in case tests already registered one
globalLoggerProvider = new DefaultLoggerProvider()
registerLoggerProvider(globalLoggerProvider, { allowOverwrite: true })

async function main() {
  // デバッグフラグを早期に検出してログを初期化
  const hasDebugFlag = process.argv.includes('--debug') || process.argv.includes('-d')
  let debugLogPath: string | undefined

  if (hasDebugFlag) {
    // 既存のproviderインスタンスを再利用
    if (!globalLoggerProvider) {
      globalLoggerProvider = new DefaultLoggerProvider()
      registerLoggerProvider(globalLoggerProvider, { allowOverwrite: true })
    }
    globalLoggerProvider.setLogLevel('debug')
    const fileLogger = new FileLogger()
    globalLoggerProvider.registerSink(fileLogger)
    debugLogPath = fileLogger.getFilePath()
    globalLoggerProvider.enableConsole(false) // CLIモードではコンソールを無効化

    const debugLogger = getLogger('Main')
    debugLogger.info('Debug logging initialized', {
      logFile: fileLogger.getFilePath(),
      args: process.argv,
    })
  }

  const program = new Command()

  program
    .name('metatell-ai-bot')
    .description('AI bot for Metatell metaverse')
    .version('1.0.0')
    .argument('[url]', 'Metatell room URL (e.g., https://metatell.app/LWF5w8n/)')
    .option('-t, --token <token>', 'Authentication token')
    .option('-d, --debug', 'Enable debug mode', false)
    .option('-p, --profile <name>', 'Use a named profile from config')
    .parse(process.argv)

  const options = program.opts()
  const [url] = program.args

  // Validate command-line arguments with valibot
  let cliArgs: CliArgs
  try {
    cliArgs = parseCliArgs(options, url)
  } catch (error) {
    if (v.isValiError(error)) {
      console.error('Invalid arguments:')
      error.issues.forEach((issue) => {
        console.error(`  ${issue.path?.join('.')}: ${issue.message}`)
      })
    } else {
      console.error('Error parsing arguments:', error)
    }
    process.exit(1)
  }

  // Initialize bot with BotInitializer
  const initializer = new BotInitializer()
  let botInitResult: Awaited<ReturnType<typeof initializer.setup>>

  try {
    botInitResult = await initializer.setup(cliArgs)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid command line flags')) {
        // Extract the specific validation error
        if (error.message.includes('--url')) {
          console.error('Error: Invalid URL format')
        } else {
          console.error(`Error: ${error.message}`)
        }
      } else if (error.message.includes('No URL specified')) {
        program.help()
        return
      } else {
        console.error('Error initializing bot:', error.message)
      }
    } else {
      console.error('Error initializing bot:', error)
    }
    process.exit(1)
  }

  const { config: botConfig, client, commandContext } = botInitResult

  // Handle shutdown gracefully
  const shutdown = async () => {
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Display bot configuration
  console.log(`🤖 Bot Configuration:`)
  console.log(`   Room URL: ${botConfig.hubUrl}`)
  console.log(`   Hub ID: ${botConfig.hubId}`)
  if (botInitResult.organizationInfo?.organizationId) {
    console.log(`   Organization: ${botInitResult.organizationInfo.organizationId}`)
  }
  console.log(``)
  console.log(`👤 Bot Profile:`)
  console.log(`   Name: ${botConfig.profile.displayName}`)
  console.log(`   Avatar ID: ${botConfig.profile.avatarId}`)
  if (botInitResult.selectedAvatar) {
    console.log(`   Avatar Name: ${botInitResult.selectedAvatar.name}`)
  }
  console.log(`\nConnecting to: ${botConfig.hubUrl}`)

  // 設定表示後にログプロバイダーのコンソール出力を制御
  if (globalLoggerProvider) {
    globalLoggerProvider.enableConsole(false)
  }

  // ユーザーが情報を確認できるよう少し待機
  await new Promise((resolve) => setTimeout(resolve, 2000))

  try {
    // Connect to the room
    await client.connect()

    // 接続後にコマンドコンテキストのmessageServiceを更新（一時的な回避策）
    // client内部のmessageServiceを使うようにする
    const clientWithMessageService = client as unknown as {
      messageService?: typeof commandContext.messageService
    }
    commandContext.messageService =
      clientWithMessageService.messageService || commandContext.messageService

    // Start the CLI interface
    const { MetatellClientAdapter } = await import('./MetatellClientAdapter.js')
    const adapterClient = new MetatellClientAdapter(client)
    const _cliApp = startInkCli(adapterClient, commandContext)

    // CLI起動完了を通知
    const { logger: cliLogger } = await import('./utils/logger.js')
    cliLogger.notifyCliStarted?.()

    // デバッグモードの場合、ログファイルパスを表示
    if (debugLogPath) {
      // CLIのloggerで表示
      cliLogger.log(`📝 Debug logging enabled: ${debugLogPath}`)
    }

    // デバッグモードの場合はアバター情報表示後に構造化ログのコンソール出力を有効化
    if (botConfig.debug && globalLoggerProvider) {
      globalLoggerProvider.enableConsole(true)
    }
  } catch (error) {
    console.error('Failed to start bot:', error)
    process.exit(1)
  }
}

// Run the bot
main().catch((_error) => {
  process.exit(1)
})
