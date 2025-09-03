import type { MetatellClient } from '@metatell/sdk'
import { render } from 'ink'
import type { CommandContext } from '../bots/commands/BotCommand.js'
import { InkCliInterface } from './InkCliInterface.js'

export function startInkCli(client: MetatellClient, commandContext: CommandContext) {
  // Ink uses stdin raw mode, so TTY check is required
  if (!process.stdin.isTTY) {
    console.error('Error: Cannot read keyboard input. stdin is not a TTY.')
    console.error('This may happen when running through certain IDEs or CI environments.')
    console.error('Try running the command directly in a terminal.')
    process.exit(1)
  }

  // Clear screen
  console.clear()

  const app = render(<InkCliInterface client={client} commandContext={commandContext} />)

  return app
}
