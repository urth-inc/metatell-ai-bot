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
import { BotServiceFactory } from './bots/BotServiceFactory.js'
import { ConfigManager } from './cli/config/config.js'
import type { CommandContext } from './bots/commands/BotCommand.js'
import { startInkCli } from './cli/startInkCli.js'
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

  // デバッグモードの場合、パース結果を表示
  const mainLogger = getLogger('Main')
  if (options.debug) {
    mainLogger.debug('Debug mode enabled via CLI')
    mainLogger.debug('Parsed options', options)
    mainLogger.debug('URL', { url })
  }

  // フラグをConfigManager用の形式に変換
  const flags: Record<string, string | boolean> = {}
  if (url) flags['--url'] = url
  if (options.token) flags['--token'] = options.token
  if (options.debug) flags['--debug'] = true
  if (options.profile) flags['--profile'] = options.profile

  // 設定を読み込み
  const configManager = new ConfigManager()
  const config = configManager.getConfig(flags)

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
    authUrl: socketUrl,
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
  }

  // Initialize BotServiceFactory with configuration (includes bot-specific services)
  const factory = new BotServiceFactory(botConfig)

  // AppSettingsを取得してLoggingシステムを設定
  const appSettings = factory.getService<import('@metatell/sdk').IAppSettings>('IAppSettings')

  // デバッグモードでファイルログを有効化
  let debugLogPath: string | undefined

  if (config.debug) {
    appSettings.setDebugMode(true)
    appSettings.setLogLevel('debug')

    // 新しいプロバイダーを作成してファイルロガーを追加
    const provider = new DefaultLoggerProvider()
    provider.setLogLevel('debug') // デバッグレベルを設定
    const fileLogger = new FileLogger()
    provider.registerSink(fileLogger)
    debugLogPath = fileLogger.getFilePath()

    // CLIモードではコンソールログを無効化（CLIインターフェースと競合するため）
    provider.enableConsole(false)

    // グローバルプロバイダーを再登録
    registerLoggerProvider(provider, { allowOverwrite: true })

    const mainLogger = getLogger('Main')
    mainLogger.info('Debug mode enabled with file logging', {
      logFile: fileLogger.getFilePath(),
    })
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
        authUrl: socketUrl,
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

  // Create command context for CLI
  const commandContext: CommandContext = {
    avatarController: factory.getService('IAvatarController'),
    userAvatarManager: factory.getService('IUserAvatarManager'),
    presenceManager: factory.getService('IPresenceManager'),
    messageService: factory.getService('IMessageService'),
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
  } catch (_error) {
    process.exit(1)
  }
}

// Run the bot
main().catch((_error) => {
  process.exit(1)
})
