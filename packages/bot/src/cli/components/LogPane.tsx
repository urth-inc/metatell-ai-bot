import { Box, Text, useStdout } from 'ink'
import type React from 'react'
import { useMemo } from 'react'
import type { LogRecord } from '../../utils/logging/logger-factory.js'

export interface LogPaneProps {
  logs: LogRecord[]
  filterRegex?: RegExp
  height: number
}

/**
 * Log display pane with filtering and word wrap
 */
export const LogPane: React.FC<LogPaneProps> = ({ logs, filterRegex, height }) => {
  const { stdout } = useStdout()
  const columns = stdout?.columns || 80

  // Filtering and formatting
  const processedLogs = useMemo(() => {
    let filtered = logs
    if (filterRegex) {
      filtered = logs.filter((log) => filterRegex.test(log.msg))
    }

    return filtered.map((log) => ({
      ...log,
      lines: wrapText(formatLogMessage(log), columns - 4), // Subtract padding
    }))
  }, [logs, filterRegex, columns])

  // Calculate number of lines to display
  const visibleLines = useMemo(() => {
    const lines: Array<{ log: LogRecord; line: string; isFirst: boolean }> = []
    let totalLines = 0

    // Process from newest logs in reverse order
    for (let i = processedLogs.length - 1; i >= 0 && totalLines < height; i--) {
      const log = processedLogs[i]
      const logLines = log.lines.slice().reverse() // Reverse lines within each log too

      for (let j = 0; j < logLines.length && totalLines < height; j++) {
        lines.unshift({
          log: log,
          line: logLines[j],
          isFirst: j === logLines.length - 1, // First line in original order
        })
        totalLines++
      }
    }

    // Calculate number of hidden messages
    const hiddenCount = logs.length - processedLogs.length
    const hasMore = totalLines < processedLogs.reduce((sum, log) => sum + log.lines.length, 0)

    return { lines, hiddenCount, hasMore }
  }, [processedLogs, height, logs.length])

  const getLogIcon = (level: string): string => {
    switch (level) {
      case 'error':
        return '✗'
      case 'warn':
        return '⚠'
      case 'info':
        return 'ℹ'
      case 'debug':
        return '●'
      default:
        return '•'
    }
  }

  const getLogColor = (_level: string): string | undefined => {
    // No colors (as per user request)
    return undefined
  }

  return (
    <Box flexDirection="column" height={height} paddingX={2}>
      {logs.length === 0 ? (
        <Text dimColor>No messages yet. Type /help to get started.</Text>
      ) : (
        <>
          {(visibleLines.hiddenCount > 0 || visibleLines.hasMore) && (
            <Text dimColor>
              ... {visibleLines.hiddenCount + (visibleLines.hasMore ? 1 : 0)} older messages hidden
              ...
            </Text>
          )}
          {visibleLines.lines.map((item, index) => (
            <Box key={`${item.log.ts}-${index}`}>
              {item.isFirst ? (
                <>
                  <Text dimColor>[{formatTime(item.log.ts)}]</Text>
                  <Text color={getLogColor(item.log.level)}> {getLogIcon(item.log.level)} </Text>
                  <Text>{item.line}</Text>
                </>
              ) : (
                <Text> {item.line}</Text>
              )}
            </Box>
          ))}
        </>
      )}
    </Box>
  )
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatLogMessage(log: LogRecord): string {
  let message = log.msg
  if (log.meta) {
    message += ` ${JSON.stringify(log.meta)}`
  }
  return message
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text]
  }

  const lines: string[] = []
  let currentLine = ''

  const words = text.split(' ')
  for (const word of words) {
    if (currentLine.length + word.length + 1 > width) {
      if (currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = word
      } else {
        // Force split if word is longer than width
        let remaining = word
        while (remaining.length > 0) {
          lines.push(remaining.substring(0, width))
          remaining = remaining.substring(width)
        }
      }
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}
