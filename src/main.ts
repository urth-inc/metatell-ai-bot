#!/usr/bin/env node

import './websocket-polyfill.js'
import { ConfigManager } from './cli/config/config.js'
import { startInkCli } from './cli/startInkCli.js'
import type { BotConfiguration } from './core/interfaces/IConfigurationProvider.js'
import { ServiceFactory } from './core/ServiceFactory.js'
import { createAgentClient } from './sdk/AgentClient.js'
import { LoggerFactory } from './utils/logging/logger-factory.js'

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
  // コマンドライン引数をパース
  const args = process.argv.slice(2)
  const flags: Record<string, string | boolean> = {}

  // 最初の引数がURLの場合は、直接接続先として扱う
  if (args.length > 0 && args[0].startsWith('https://')) {
    flags['--url'] = args[0]
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const flag = args[i]
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[flag] = args[i + 1]
        i++
      } else {
        flags[flag] = true
      }
    }
  }

  // 設定を読み込み
  const configManager = new ConfigManager()
  const config = configManager.getConfig(flags)

  // URL が指定されていない場合はヘルプを表示
  if (!config.url && !args.includes('--help')) {
    console.error('Error: Connection URL is required\n')
    console.error('Usage:')
    console.error('  npm run start <url>')
    console.error('  npm run start https://metatell.app/LWF5w8n/')
    console.error('\nOptions:')
    console.error('  --token <token>    Authentication token (optional)')
    console.error('  --debug            Enable debug mode')
    process.exit(1)
  }

  // デフォルト値
  const metatellUrl = config.url!
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
  } catch (error) {
    console.error(`Error: Invalid URL format - ${metatellUrl}`)
    process.exit(1)
  }

  // Create bot using factory
  const factory = new ServiceFactory()
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
  }

  // ダミーのボットを作成（後方互換性のため）
  factory.createBot(botConfig)

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

  // デバッグモードの設定
  if (config.debug) {
    const { logger } = await import('./utils/logger.js')
    logger.setDebugMode(true)
  }

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
    LoggerFactory.enableConsole()
    const { logger } = await import('./utils/logger.js')
    logger.notifyCliStarted?.()

    // 自動接続
    LoggerFactory.createLogger('Main').info('Connecting to', { url: metatellUrl })
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
