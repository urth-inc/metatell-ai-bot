import type { AgentClient } from '@metatell/sdk'
import { render } from 'ink'
import type { CommandContext } from '../bots/commands/BotCommand.js'
import { InkCliInterface } from './InkCliInterface.js'

export function startInkCli(client: AgentClient, commandContext: CommandContext) {
  // Raw modeがサポートされているかチェック
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Error: This CLI requires an interactive terminal (TTY)')
    console.error('Please run directly in a terminal, not piped or redirected')
    process.exit(1)
  }

  // 画面をクリア
  console.clear()

  const app = render(<InkCliInterface client={client} commandContext={commandContext} />)

  return app
}
