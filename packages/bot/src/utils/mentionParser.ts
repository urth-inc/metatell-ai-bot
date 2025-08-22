/**
 * Mention parsing utilities for bot commands
 */

/**
 * Create a regular expression pattern for bot mentions
 * @param botName The bot's display name
 * @param startOnly Whether to match only at the start of the message
 * @returns A RegExp for matching mentions
 */
function createMentionPattern(botName: string, startOnly = false): RegExp {
  // Escape special regex characters in bot name
  const escapedBotName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Build pattern: @botName followed by space or end of string
  const pattern = `@${escapedBotName}(?:\\s|$)`
  
  // Apply start-of-line anchor if needed
  const fullPattern = startOnly ? `^${pattern}` : pattern
  
  return new RegExp(fullPattern, 'i')
}

/**
 * Parse a mention from a message
 * @param message The full message text
 * @param botName The bot's display name
 * @returns The command text after the mention, or null if no mention found at start
 */
export function parseMention(message: string, botName: string): string | null {
  const mentionPattern = createMentionPattern(botName, true) // Match at start only

  if (!mentionPattern.test(message)) {
    return null
  }

  return message.replace(mentionPattern, '').trim()
}

/**
 * Check if a message contains a mention of the bot
 * @param message The message to check
 * @param botName The bot's display name
 * @returns True if the message mentions the bot anywhere
 */
export function isMentioned(message: string, botName: string): boolean {
  const mentionPattern = createMentionPattern(botName, false) // Match anywhere
  return mentionPattern.test(message)
}

/**
 * Extract command text from a mentioned message
 * @deprecated Use parseMention instead - they provide identical functionality
 * @param message The full message with mention
 * @param botName The bot's display name
 * @returns The command text without the mention
 */
export function extractCommand(message: string, botName: string): string {
  // This is essentially the same as parseMention but without the null check
  // Keeping for backward compatibility, but marked as deprecated
  return parseMention(message, botName) || ''
}
