/**
 * Mention parsing utilities for bot commands
 */

/**
 * Parse a mention from a message
 * @param message The full message text
 * @param botName The bot's display name
 * @returns The command text after the mention, or null if no mention found
 */
export function parseMention(message: string, botName: string): string | null {
  const escapedBotName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionPattern = new RegExp(`^@${escapedBotName}(?:\\s|$)`, 'i')

  if (!mentionPattern.test(message)) {
    return null
  }

  return message.replace(mentionPattern, '').trim()
}

/**
 * Check if a message contains a mention of the bot
 * @param message The message to check
 * @param botName The bot's display name
 * @returns True if the message mentions the bot
 */
export function isMentioned(message: string, botName: string): boolean {
  const escapedBotName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionPattern = new RegExp(`@${escapedBotName}(?:\\s|$)`, 'i')
  return mentionPattern.test(message)
}

/**
 * Extract command text from a mentioned message
 * @param message The full message with mention
 * @param botName The bot's display name
 * @returns The command text without the mention
 */
export function extractCommand(message: string, botName: string): string {
  const escapedBotName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionPattern = new RegExp(`@${escapedBotName}(?:\\s|$)`, 'i')
  return message.replace(mentionPattern, '').trim()
}
