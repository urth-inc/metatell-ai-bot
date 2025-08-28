#!/usr/bin/env node

import './websocket-polyfill.js'
import {
  type BotConfiguration,
  DefaultAgentClient,
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
import { type CliArgs, parseCliArgs } from './schemas/cli.js'
import { FileLogger } from './utils/logging/file-logger.js'
import { processMetatellUrl } from './utils/metatell-url.js'
import { fetchOrganizationAvatarsForBot } from './utils/organization-avatar.js'

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
  let avatarId = config.profile?.avatarId || 'Esajk7B'
  const authToken = config.token
  const botAccessKey = config.botAccessKey

  let hubId: string
  let socketUrl: string

  try {
    // メタテル固有のURL処理（テナントサブドメインの除去など）
    const { serverUrl, hubId: extractedHubId } = processMetatellUrl(metatellUrl)
    hubId = extractedHubId
    socketUrl = serverUrl

    mainLogger.debug('Processed Metatell URL:', {
      original: metatellUrl,
      serverUrl: socketUrl,
      hubId: hubId,
    })
  } catch (error) {
    mainLogger.error('Invalid URL format', { url: metatellUrl, error })
    process.exit(1)
  }

  // 組織アバター選択処理はBotConfigを作成してから、FactoryでOrganizationServiceが利用可能になってから実行
  const avatarSelection = config.profile?.avatarSelection
  let pendingAvatarSelection: (() => Promise<{ avatarId: string; avatarName?: string }>) | null =
    null

  if (avatarSelection && (avatarSelection === 'organization' || avatarSelection === 'random')) {
    // アバター選択を後で実行するための関数を準備
    pendingAvatarSelection = async () => {
      try {
        const organizationService =
          factory.getService<import('@metatell/sdk').IOrganizationService>('IOrganizationService')
        mainLogger.debug('Fetching organization avatars...')
        const orgAvatars = await fetchOrganizationAvatarsForBot(
          organizationService,
          metatellUrl,
          hubId,
        )

        if (orgAvatars.length > 0) {
          const selectedAvatarId = organizationService.selectAvatar(orgAvatars, {
            avatarId: config.profile?.avatarId,
            preferRandom: avatarSelection === 'random',
          })

          if (selectedAvatarId) {
            const selectedAvatar = orgAvatars.find((a) => a.avatar_id === selectedAvatarId)
            mainLogger.info('Selected organization avatar:', {
              avatarId: selectedAvatarId,
              avatarName: selectedAvatar?.name,
              method: avatarSelection,
              availableCount: orgAvatars.length,
            })
            return {
              avatarId: selectedAvatarId,
              avatarName: selectedAvatar?.name,
            }
          }
        } else {
          mainLogger.warn('No organization avatars found, using default')
        }
      } catch (error) {
        mainLogger.error('Failed to fetch organization avatars, using default', { error })
      }
      return { avatarId } // デフォルトに戻す
    }
  } else if (avatarSelection && avatarSelection !== avatarId) {
    // avatarSelectionに具体的なアバターIDが指定されている場合
    avatarId = avatarSelection
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

  // AgentClient を作成（既存のfactoryを使用してサービスの重複を避ける）
  const client = new DefaultAgentClient(factory, {
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
    // Additional context for CLI commands
    client: client,
    agentClient: client,
    botConfig: botConfig,
    organizationService:
      factory.getService<import('@metatell/sdk').IOrganizationService>('IOrganizationService'),
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
    // 組織アバター選択が必要な場合は実行
    let avatarName: string | undefined
    let organizationInfo: { organizationId?: string; realmId?: string } = {}

    if (pendingAvatarSelection) {
      const result = await pendingAvatarSelection()
      // 選択されたアバターIDでプロファイルを更新
      botConfig.profile.avatarId = result.avatarId
      avatarName = result.avatarName
      // AgentClientも更新が必要
      const configProvider =
        factory.getService<import('@metatell/sdk').IConfigurationProvider>('IConfigurationProvider')
      configProvider.getConfiguration().profile.avatarId = result.avatarId
    }

    // 組織情報を取得（エラーが出ても続行）
    try {
      const organizationService =
        factory.getService<import('@metatell/sdk').IOrganizationService>('IOrganizationService')
      organizationInfo = await organizationService.getOrganizationInfo(metatellUrl, hubId)
    } catch (error) {
      mainLogger.debug('Failed to get organization info', { error })
    }

    // 現在の設定を表示（ログプロバイダーを無効化する前に実行）
    console.log(`🤖 Bot Configuration:`)
    console.log(`   Room URL: ${metatellUrl}`)
    console.log(`   Hub ID: ${hubId}`)
    if (organizationInfo.organizationId) {
      console.log(`   Organization: ${organizationInfo.organizationId}`)
    }
    console.log(``)
    console.log(`👤 Bot Profile:`)
    console.log(`   Name: ${botConfig.profile.displayName}`)
    console.log(`   Avatar ID: ${botConfig.profile.avatarId}`)
    if (avatarName) {
      console.log(`   Avatar Name: ${avatarName}`)
    }
    if (avatarSelection) {
      console.log(
        `   Selection: ${avatarSelection === 'random' ? '🎲 Random' : avatarSelection === 'organization' ? '🏢 Organization Default' : '📌 Specified'}`,
      )
    }
    console.log(`\nConnecting to: ${metatellUrl}`)

    // 設定表示後にログプロバイダーのコンソール出力を制御
    if (globalLoggerProvider) {
      globalLoggerProvider.enableConsole(false)
    }

    // 自動接続
    await client.connect({
      url: metatellUrl,
      serverUrl: socketUrl,
      hubUrl: metatellUrl,
      hubId: hubId,
      token: authToken,
    })

    // 接続後にコマンドコンテキストのmessageServiceを更新（一時的な回避策）
    // client内部のmessageServiceを使うようにする
    const clientWithMessageService = client as {
      messageService?: typeof commandContext.messageService
    }
    commandContext.messageService =
      clientWithMessageService.messageService || commandContext.messageService

    // CLI を起動（接続後に起動）
    const _cliApp = startInkCli(client, commandContext)

    // CLI起動完了を通知
    const { logger: cliLogger } = await import('./utils/logger.js')
    cliLogger.notifyCliStarted?.()

    // デバッグモードの場合は構造化ログのコンソール出力を再有効化
    if (config.debug && globalLoggerProvider) {
      globalLoggerProvider.enableConsole(true)
    }

    // デバッグモードの場合、ログファイルパスを表示
    if (debugLogPath) {
      // CLIのloggerで表示
      cliLogger.log(`📝 Debug logging enabled: ${debugLogPath}`)
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
