import { Box, render, Text } from 'ink'
import type React from 'react'
import { useEffect, useState } from 'react'

interface LogEntry {
  id: string
  message: string
  timestamp: string
}

const SimpleCliTest: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    console.log('SimpleCliTest useEffect running')

    // Explicitly add logs
    const testLogs: LogEntry[] = [
      {
        id: 'test-1',
        message: 'Simple test message 1',
        timestamp: '18:30:00',
      },
      {
        id: 'test-2',
        message: 'Simple test message 2',
        timestamp: '18:30:01',
      },
    ]

    console.log('Setting test logs:', testLogs)
    setLogs(testLogs)
  }, [])

  console.log('Render: logs length =', logs.length)

  return (
    <Box flexDirection="column">
      <Text bold>SIMPLE CLI TEST</Text>
      <Text>─────────────────────────────</Text>

      <Box flexDirection="column">
        <Text>Log entries: {logs.length}</Text>
        {logs.length === 0 ? (
          <Text dimColor>No logs yet...</Text>
        ) : (
          <Box flexDirection="column">
            {logs.map((log) => (
              <Box key={log.id}>
                <Text dimColor>[{log.timestamp}]</Text>
                <Text> {log.message}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

// Allow direct execution (ESM support)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = render(<SimpleCliTest />)
  setTimeout(() => {
    app.unmount()
    process.exit(0)
  }, 3000)
}

export default SimpleCliTest
