#!/usr/bin/env node

import './websocket-polyfill.js'
import { Command } from 'commander'
import { ConfigManager } from './cli/config/config.js'
import { startInkCli } from './cli/startInkCli.js'
import type { BotConfiguration } from './core/interfaces/IConfigurationProvider.js'
import { ServiceFactory } from './core/ServiceFactory.js'
import { createAgentClient } from './sdk/AgentClient.js'
import { registerLoggerProvider, getLogger, DefaultLoggerProvider } from './sdk/logging/index.js'

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
  if (options.debug) {
    console.log('🔍 Debug mode enabled via CLI')
    console.log('🔍 Parsed options:', options)
    console.log('🔍 URL:', url)
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
    console.error(`Error: Invalid URL format - ${metatellUrl}`)
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

  // Initialize ServiceFactory with configuration (no runtime re-registration)
  const factory = new ServiceFactory(botConfig)
  
  // AppSettingsを取得してLoggingシステムを設定
  const appSettings = factory.getService<import('./core/interfaces/IAppSettings.js').IAppSettings>('IAppSettings')
  const provider = new DefaultLoggerProvider()
  
  // デバッグモード変更時のログレベル制御をここで行う（責務の分離）
  appSettings.onDebugModeChanged((enabled) => {
    // ログレベルをデバッグモードに応じて設定
    appSettings.setLogLevel(enabled ? 'debug' : 'info')
    
    if (enabled) {
      console.log('🔍 Debug mode enabled via AppSettings')
      console.log('🔍 Bot configuration:', {
        authUrl: socketUrl,
        hubUrl: metatellUrl,
        hubId: hubId,
        botName: botName,
        avatarId: avatarId,
        debug: enabled
      })
      provider.enableConsole(true)
    } else {
      provider.enableConsole(false)
    }
  })
  
  // 初期状態でデバッグモードが有効な場合も処理
  if (appSettings.debugMode) {
    console.log('🔍 Debug mode enabled via AppSettings')
    console.log('🔍 Bot configuration:', {
      authUrl: socketUrl,
      hubUrl: metatellUrl,
      hubId: hubId,
      botName: botName,
      avatarId: avatarId,
      debug: appSettings.debugMode
    })
    provider.enableConsole(true)
  }

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
    const _cliApp = startInkCli(client)

    // CLI起動完了を通知
    if (!config.debug) {
      provider.enableConsole(false)
    }
    const { logger } = await import('./utils/logger.js')
    logger.notifyCliStarted?.()

    // 自動接続
    getLogger('Main').info('Connecting to', { url: metatellUrl })
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
