import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import type React from 'react'

export interface FooterProps {
  input: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  suggestions: Array<{ command: string; description: string }>
  selectedSuggestionIndex: number
}

/**
 * Footer component with input field and command suggestions
 */
export const Footer: React.FC<FooterProps> = ({
  input,
  onChange,
  onSubmit,
  suggestions,
  selectedSuggestionIndex,
}) => {
  return (
    <Box flexDirection="column">
      {/* Suggestion display area (always reserves height) */}
      <Box paddingX={2} height={suggestions.length > 0 ? 2 : 0}>
        {suggestions.length > 0 && (
          <Box flexDirection="column">
            <Box>
              {suggestions.map((suggestion, index) => (
                <Text key={suggestion.command} dimColor={index !== selectedSuggestionIndex}>
                  {index === selectedSuggestionIndex ? '▸ ' : '  '}
                  {suggestion.command}
                  {index < suggestions.length - 1 ? '  ' : ''}
                </Text>
              ))}
            </Box>
            <Text dimColor>↑/↓ to select • Tab to complete • Ctrl+R for history search</Text>
          </Box>
        )}
      </Box>

      <Box paddingX={2}>
        <Text dimColor>{'─'.repeat(80)}</Text>
      </Box>

      {/* Input field */}
      <Box paddingX={2}>
        <Text bold>❯ </Text>
        <TextInput value={input} onChange={onChange} onSubmit={onSubmit} />
      </Box>

      {/* Help text */}
      <Box paddingX={2}>
        <Text dimColor>
          ↑/↓ History • Tab Complete • Ctrl+R Search • Esc Clear filter • Ctrl+C×2 Exit
        </Text>
      </Box>
    </Box>
  )
}
