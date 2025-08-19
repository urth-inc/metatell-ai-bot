import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type React from 'react'

export interface HeaderProps {
  status: 'connected' | 'disconnected' | 'connecting'
  userCount: number
  rtt?: number
  retries: number
  rateLimit?: number
  filterRegex?: string
  reconnectProgress?: {
    retryIn: number
    progress: number
  }
}

/**
 * CLI header component showing connection status and metrics
 */
export const Header: React.FC<HeaderProps> = ({
  status,
  userCount,
  rtt,
  retries,
  rateLimit,
  filterRegex,
  reconnectProgress,
}) => {
  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return <Text>Connected</Text>
      case 'disconnected':
        return <Text>Disconnected</Text>
      case 'connecting':
        return (
          <>
            <Text>Connecting</Text>
            <Text> </Text>
            <Spinner type="dots" />
          </>
        )
    }
  }

  const getProgressBar = (progress: number, width = 10): string => {
    const filled = Math.floor(progress * width)
    const empty = width - filled
    return `[${'='.repeat(filled)}${' '.repeat(empty)}]`
  }

  return (
    <Box flexDirection="column">
      <Box paddingX={2}>
        {getStatusText()}
        <Text> | </Text>
        <Text>Users: {userCount}</Text>
        {rtt !== undefined && (
          <>
            <Text> | </Text>
            <Text>RTT: {rtt}ms</Text>
          </>
        )}
        <Text> | </Text>
        <Text>Retries: {retries}</Text>
        {rateLimit !== undefined && (
          <>
            <Text> | </Text>
            <Text>Rate: {rateLimit}m/s</Text>
          </>
        )}
        {filterRegex && (
          <>
            <Text> | </Text>
            <Text>Filter: /{filterRegex}/</Text>
          </>
        )}
      </Box>
      {reconnectProgress && (
        <Box paddingX={2}>
          <Text>Retry in {reconnectProgress.retryIn.toFixed(1)}s </Text>
          <Text>{getProgressBar(reconnectProgress.progress)}</Text>
        </Box>
      )}
      <Box paddingX={2}>
        <Text dimColor>{'─'.repeat(80)}</Text>
      </Box>
    </Box>
  )
}
