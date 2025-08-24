#!/usr/bin/env node

import './websocket-polyfill.js'
import {
  type BotConfiguration,
  createAgentClient,
  DefaultLoggerProvider,
  getLogger,
  registerLoggerProvider,
} from '@metatell/sdk'
import { Command } from 'commander'
import * as v from 'valibot'
import { BotServiceFactory } from './bots/BotServiceFactory.js'
import type { CommandContext } from './bots/commands/BotCommand.js'
import { ConfigManager } from './cli/config/config.js'
import { startInkCli } from './cli/startInkCli.js'
import { parseCliArgs, type CliArgs } from './schemas/cli.js'
import { FileLogger } from './utils/logging/file-logger.js'

// Register default logger provider at startup
// Allow overwrite in case tests already registered one
registerLoggerProvider(new DefaultLoggerProvider(), { allowOverwrite: true })

/**
 * Extract hub ID from Metatell URL
 */
function extractHubIdFromUrl(url: string): string {
  // https://metatell.app/DfueGup/palatable-hospitable-outing
  // から DfueGup を抽出
  const match = url.match(/metatell\.app\/([^/]+)/)
  if (match) {
    return match[1]
  }
  throw new Error('Invalid Metatell URL')
}

async function main() {
  // デバッグフラグを早期に検出してログを初期化
  const hasDebugFlag = process.argv.includes('--debug') || process.argv.includes('-d')
  let debugLogPath: string | undefined

  if (hasDebugFlag) {
    // デバッグログを最初に初期化
    const provider = new DefaultLoggerProvider()
    provider.setLogLevel('debug')
    const fileLogger = new FileLogger()
    provider.registerSink(fileLogger)
    debugLogPath = fileLogger.getFilePath()
    provider.enableConsole(false) // CLIモードではコンソールを無効化
    registerLoggerProvider(provider, { allowOverwrite: true })

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

  // デバッグモードの場合、パース結果を表示
  const mainLogger = getLogger('Main')
  if (cliArgs.debug) {
    mainLogger.debug('Debug mode enabled via CLI')
    mainLogger.debug('Validated CLI args', cliArgs)
  }

  // フラグをConfigManager用の形式に変換
  const flags: Record<string, string | boolean> = {}
  if (cliArgs.url) flags['--url'] = cliArgs.url
  if (cliArgs.token) flags['--token'] = cliArgs.token
  if (cliArgs.debug) flags['--debug'] = true
  if (cliArgs.profile) flags['--profile'] = cliArgs.profile

  // 設定を読み込み
  const configManager = new ConfigManager()
  let config: import('./cli/config/config.js').Config
  try {
    config = configManager.getConfig(flags)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid command line flags')) {
      // Extract the specific validation error
      if (error.message.includes('--url')) {
        console.error('Error: Invalid URL format')
      } else {
        console.error(`Error: ${error.message}`)
      }
    } else {
      console.error('Error loading configuration:', error)
    }
    process.exit(1)
  }

  // URL が指定されていない場合はヘルプを表示
  if (!config.url) {
    program.help()
    return
  }

  // デフォルト値
  const metatellUrl = config.url || ''
  const botName = config.profile?.displayName || 'AI Assistant'
  const avatarId = config.profile?.avatarId || 'hsBHyUu2'
  const authToken = config.token
  const botAccessKey = config.botAccessKey

  let hubId: string
  let socketUrl: string

  try {
    hubId = extractHubIdFromUrl(metatellUrl)
    const url = new URL(metatellUrl)
    // Use WebSocket protocol for Socket connection
    socketUrl = `wss://${url.hostname}`
  } catch (_error) {
    mainLogger.error('Invalid URL format', { url: metatellUrl })
    process.exit(1)
  }

  // Create bot configuration
  const botConfig: BotConfiguration = {
    serverUrl: socketUrl,
    hubUrl: metatellUrl,
    hubId: hubId,
    profile: {
      displayName: botName,
      avatarId,
    },
    context: {
      mobile: false,
      embed: false,
      hmd: false,
    },
    debug: config.debug,
    botAccessKey: botAccessKey,
  }

  // Initialize BotServiceFactory with configuration (includes bot-specific services)
  const factory = new BotServiceFactory(botConfig)

  // AppSettingsを取得してLoggingシステムを設定
  const appSettings = factory.getService<import('@metatell/sdk').IAppSettings>('IAppSettings')

  // デバッグモードの場合はAppSettingsも更新
  if (config.debug) {
    appSettings.setDebugMode(true)
    appSettings.setLogLevel('debug')
  }

  // デバッグモード変更時のログレベル制御をここで行う（責務の分離）
  appSettings.onDebugModeChanged((enabled) => {
    // ログレベルをデバッグモードに応じて設定
    appSettings.setLogLevel(enabled ? 'debug' : 'info')

    if (enabled && !config.debug) {
      // 動的にデバッグモードが有効になった場合（CLIコマンドから）
      const mainLogger = getLogger('Main')
      mainLogger.debug('Debug mode enabled via AppSettings')
      mainLogger.debug('Bot configuration', {
        serverUrl: socketUrl,
        hubUrl: metatellUrl,
        hubId: hubId,
        botName: botName,
        avatarId: avatarId,
        debug: enabled,
      })
    }
  })

  // AgentClient を作成
  const client = createAgentClient(factory, {
    profile: {
      displayName: botName,
      avatarId,
    },
    rateLimit: config.rate
      ? {
          messages: config.rate.messagesPerSec,
          moves: config.rate.movesPerSec,
          looks: config.rate.looksPerSec,
        }
      : undefined,
  })

  // Create command context for CLI with proper typing
  const commandContext: CommandContext = {
    avatarController:
      factory.getService<import('@metatell/sdk').IAvatarController>('IAvatarController'),
    userAvatarManager:
      factory.getService<import('@metatell/sdk').IUserAvatarManager>('IUserAvatarManager'),
    presenceManager:
      factory.getService<import('@metatell/sdk').IPresenceManager>('IPresenceManager'),
    messageService: factory.getService<import('@metatell/sdk').IMessageService>('IMessageService'),
    logger: getLogger('CLI'),
  }

  // デバッグモードの設定はAppSettingsで管理される

  // Handle shutdown gracefully
  const shutdown = async () => {
    await client.disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    // CLI を起動
    const _cliApp = startInkCli(client, commandContext)

    // CLI起動完了を通知
    const { logger: cliLogger } = await import('./utils/logger.js')
    cliLogger.notifyCliStarted?.()

    // デバッグモードの場合、ログファイルパスを表示（CLIのloggerを使用）
    if (debugLogPath) {
      cliLogger.log(`📝 Debug logging enabled: ${debugLogPath}`)
      // 少し待ってからも表示（CLIが安定してから）
      setTimeout(() => {
        cliLogger.log(`Debug logs are being written to: ${debugLogPath}`)
      }, 1000)
    }

    // 自動接続（CLIのloggerを使用）
    cliLogger.log(`Connecting to: ${metatellUrl}`)
    await client.connect({
      url: metatellUrl,
      token: authToken,
    })
  } catch (error) {
    console.error('Failed to start bot:', error)
    process.exit(1)
  }
}

// Run the bot
main().catch((_error) => {
  process.exit(1)
})
