/**
 * Interactive mode command with rich commands support
 */

import { createInterface } from 'node:readline'
import { createMetatellClient } from '@metatell/bot-sdk'
import type { CliOptions } from '../types.js'
import { CommandParser } from '../utils/commands.js'
import { parseUrl } from '../utils/url.js'

export async function startInteractiveMode(url: string, options: CliOptions) {
  console.log('Starting interactive mode...')

  try {
    const { serverUrl, roomId } = parseUrl(url)

    const client = createMetatellClient({
      serverUrl,
      roomId,
      token: options.token || process.env.METATELL_TOKEN || '',
      username: options.name || 'MetatellCLI',
      debug: options.debug,
    })

    // Event handlers
    client.on('connected', () => {
      console.log('[Connected]')
    })

    client.on('disconnected', (reason) => {
      console.log('[Disconnected]', reason || 'Connection closed')
    })

    // chat-messageイベントを使用して、より詳細なメッセージ情報を取得
    client.on('chat-message', (message) => {
      const mentionInfo = message.mention ? ` (mentions @${message.mention.name})` : ''
      console.log(`[Chat] ${message.from.name}: ${message.text}${mentionInfo}`)

      // デバッグ情報
      if (options.debug) {
        console.log(`[Debug] Sender ID: ${message.from.id}`)
      }
    })

    // メンションハンドラーを設定
    client.chat.onMention((event) => {
      console.log(`[Mentioned by ${event.from.name}] ${event.text}`)
      // 自動的に返信
      event.reply(`Hello ${event.from.name}! You said: "${event.text}"`).catch((err) => {
        console.error('[Error replying]', err)
      })
    })

    client.on('user-join', (user) => {
      console.log('[User joined]', user.name || 'Anonymous', `(${user.id})`)
    })

    client.on('user-leave', (user) => {
      console.log('[User left]', user.name || 'Anonymous', `(${user.id})`)
    })

    await client.connect()
    console.log('Connected to room:', roomId)
    console.log('Session ID:', client.getSessionId())
    console.log('Commands: /help for list of commands')
    console.log('Type messages to send, or "quit" to exit\n')

    // Setup readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    })

    // Command parser
    const parser = new CommandParser()

    rl.on('line', async (line) => {
      const input = line.trim()

      // 特殊なキーワードのみ特別扱い
      if (input === 'quit' || input === 'exit') {
        rl.close()
        return
      }

      // /で始まる場合のみコマンドとして処理
      if (input.startsWith('/')) {
        try {
          const result = await parser.execute(input, client)
          if (!result.success) {
            console.error('[Error]', result.message)
          }
        } catch (error) {
          console.error('[Error]', error instanceof Error ? error.message : 'Command failed')
        }
      } else if (input) {
        // それ以外はすべてメッセージとして送信
        try {
          await client.chat.send(input)
          console.log(`[Sent] ${input}`)
        } catch (error) {
          console.error('[Error sending message]', error)
        }
      }

      rl.prompt()
    })

    rl.on('close', async () => {
      console.log('\nShutting down...')
      await client.disconnect()
      process.exit(0)
    })

    // Show initial prompt
    rl.prompt()

    // Handle process termination
    process.on('SIGINT', () => {
      rl.close()
    })
  } catch (error) {
    console.error('Failed to start interactive mode:', error)
    process.exit(1)
  }
}
