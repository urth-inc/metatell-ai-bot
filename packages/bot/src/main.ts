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
  const avatarId = config.profile?.avatarId // デフォルトは組織アバター
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

  // アバター選択処理は上記で完了

  // 組織アバターを事前に取得
  let selectedAvatarId = avatarId
  let selectedAvatarUrl: string | undefined
  let selectedAvatarName: string | undefined

  const avatarSelection = config.profile?.avatarSelection
  if (avatarSelection && avatarSelection !== 'organization') {
    // avatarSelectionに具体的なアバターIDが指定されている場合
    selectedAvatarId = avatarSelection
  }

  // avatarIdが指定されていない、またはavatarSelectionが'organization'の場合は組織アバターから選択
  if (!selectedAvatarId) {
    // 組織アバターから選択する必要がある場合、直接APIを呼び出す
    let realmUrl = ''
    let avatarsUrl = ''
    try {
      // 組織情報を取得
      const hubUrl = new URL(metatellUrl)
      realmUrl = `${hubUrl.origin}/realm?room-id=${hubId}`
      mainLogger.debug('Fetching realm info', { realmUrl })

      const realmResponse = await fetch(realmUrl)

      if (!realmResponse.ok) {
        const errorText = await realmResponse.text()
        throw new Error(
          `Realm API failed: ${realmResponse.status} ${realmResponse.statusText} - ${errorText}`,
        )
      }

      const realmData = (await realmResponse.json()) as { result?: { id?: string; realm?: string } }
      const organizationId = realmData.result?.id

      mainLogger.debug('Realm data received', {
        hasResult: !!realmData.result,
        organizationId: organizationId || 'not found',
        realmId: realmData.result?.realm || 'not found',
      })

      if (organizationId) {
        // 組織アバターを取得
        const { serverUrl: baseUrl } = processMetatellUrl(metatellUrl)
        const httpsUrl = baseUrl.replace('wss://', 'https://')
        let apiPath = '/api/v1'
        if (httpsUrl.includes('-stg.')) {
          apiPath = '/api/admin/stg/api/v1'
        }
        avatarsUrl = `${httpsUrl}${apiPath}/organizations/${organizationId}/avatars/public`

        mainLogger.debug('Fetching organization avatars directly', { avatarsUrl })

        const avatarsResponse = await fetch(avatarsUrl)

        if (!avatarsResponse.ok) {
          const errorText = await avatarsResponse.text()
          throw new Error(
            `Organization avatars API failed: ${avatarsResponse.status} ${avatarsResponse.statusText} - ${errorText}`,
          )
        }

        const avatarsData = (await avatarsResponse.json()) as {
          result?: Array<{ id: string; name: string; gltf: { avatar: string } }>
        }

        if (avatarsData.result && avatarsData.result.length > 0) {
          // ランダムに選択
          const randomIndex = Math.floor(Math.random() * avatarsData.result.length)
          const selectedAvatar = avatarsData.result[randomIndex]
          selectedAvatarId = selectedAvatar.id
          selectedAvatarUrl = selectedAvatar.gltf.avatar
          selectedAvatarName = selectedAvatar.name

          mainLogger.info('Pre-selected organization avatar', {
            avatarId: selectedAvatarId,
            avatarName: selectedAvatarName,
            avatarUrl: selectedAvatarUrl,
          })
        }
      }
    } catch (error) {
      mainLogger.error('Failed to pre-fetch organization avatars', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        realmUrl,
        avatarsUrl: avatarsUrl || 'not yet constructed',
      })
      // エラーが発生してもデフォルトアバターで続行
    }
  }

  // Create bot configuration with organization avatar URL
  const botConfig: BotConfiguration = {
    serverUrl: socketUrl,
    hubUrl: metatellUrl,
    hubId: hubId,
    profile: {
      displayName: botName,
      avatarId: selectedAvatarId || avatarId || '', // 一時的に空文字列（後で組織アバターを必須にする）
    },
    context: {
      mobile: false,
      embed: false,
      hmd: false,
    },
    debug: config.debug,
    botAccessKey: botAccessKey,
    organizationAvatarUrl: selectedAvatarUrl,
  }

  // Initialize BotServiceFactory with configuration (includes bot-specific services)
  const factory = new BotServiceFactory(botConfig)

  // アバター情報表示状態を追跡
  let avatarInfoDisplayed = false

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

  // AgentClient作成は組織アバター選択後に行う

  // CommandContextはAgentClient作成後に設定

  // デバッグモードの設定はAppSettingsで管理される

  // clientの宣言（後で初期化）
  let client: DefaultAgentClient
  const avatarName = selectedAvatarName
  let organizationInfo: { organizationId?: string; realmId?: string } = {}

  try {
    // アバターIDが設定されていることを確認（組織アバターの取得に失敗した場合）
    if (!botConfig.profile.avatarId) {
      mainLogger.error('Failed to get organization avatar and no fallback avatar ID was provided')
      process.exit(1)
    }

    // AgentClientを作成
    client = new DefaultAgentClient(factory, {
      profile: {
        displayName: botName,
        avatarId: botConfig.profile.avatarId, // 正しく設定されたavatarIdを使用
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
      messageService:
        factory.getService<import('@metatell/sdk').IMessageService>('IMessageService'),
      logger: getLogger('CLI'),
      // Additional context for CLI commands
      client: client,
      agentClient: client,
      botConfig: botConfig,
      organizationService:
        factory.getService<import('@metatell/sdk').IOrganizationService>('IOrganizationService'),
    }

    // Handle shutdown gracefully
    const shutdown = async () => {
      await client.disconnect()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // 組織情報を設定（事前取得した情報を使用）
    if (selectedAvatarId) {
      try {
        const hubUrl = new URL(metatellUrl)
        const realmResponse = await fetch(`${hubUrl.origin}/realm?room-id=${hubId}`)
        const realmData = (await realmResponse.json()) as {
          result?: { id?: string; realm?: string }
        }
        organizationInfo = {
          organizationId: realmData.result?.id,
          realmId: realmData.result?.realm,
        }
      } catch (error) {
        mainLogger.debug('Failed to get organization info', { error })
      }
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
    if (botConfig.profile.avatarId) {
      console.log(`   Avatar ID: ${botConfig.profile.avatarId}`)
    } else {
      console.log(`   Avatar: Will be selected from organization avatars`)
    }
    if (avatarName) {
      console.log(`   Avatar Name: ${avatarName}`)
    }
    const selectionMethod =
      avatarSelection === 'random'
        ? '🎲 Random from organization'
        : avatarSelection === 'organization'
          ? '🏢 Organization default'
          : avatarSelection
            ? `📌 Specified (${avatarSelection})`
            : '🏢 Organization default'
    console.log(`   Selection: ${selectionMethod}`)
    console.log(`\nConnecting to: ${metatellUrl}`)

    // 設定表示後にログプロバイダーのコンソール出力を制御
    if (globalLoggerProvider) {
      globalLoggerProvider.enableConsole(false)
    }

    // ユーザーが情報を確認できるよう少し待機
    await new Promise((resolve) => setTimeout(resolve, 2000))

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
    const clientWithMessageService = client as unknown as {
      messageService?: typeof commandContext.messageService
    }
    commandContext.messageService =
      clientWithMessageService.messageService || commandContext.messageService

    // CLI を起動（接続後に起動）
    const _cliApp = startInkCli(client, commandContext)

    // CLI起動完了を通知
    const { logger: cliLogger } = await import('./utils/logger.js')
    cliLogger.notifyCliStarted?.()

    // CLI起動後にアバター情報を一度だけ表示
    if (!avatarInfoDisplayed) {
      avatarInfoDisplayed = true
      cliLogger.log(
        `🤖 Connected as: ${botConfig.profile.displayName} (${botConfig.profile.avatarId})`,
      )
      if (avatarName) {
        cliLogger.log(`🎨 Avatar: ${avatarName}`)
      }
      if (organizationInfo.organizationId) {
        cliLogger.log(`🏢 Organization: ${organizationInfo.organizationId}`)
      }
    }

    // デバッグモードの場合、ログファイルパスを表示
    if (debugLogPath) {
      // CLIのloggerで表示
      cliLogger.log(`📝 Debug logging enabled: ${debugLogPath}`)
    }

    // デバッグモードの場合はアバター情報表示後に構造化ログのコンソール出力を有効化
    if (config.debug && globalLoggerProvider) {
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
