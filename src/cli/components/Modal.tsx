import { Box, Text, useInput } from 'ink'
import type React from 'react'
import { useState } from 'react'

export interface ModalProps {
  content: string
  onClose: () => void
  title?: string
}

/**
 * Modal component for displaying long text or JSON with pagination
 */
export const Modal: React.FC<ModalProps> = ({ content, onClose, title }) => {
  const [scrollOffset, setScrollOffset] = useState(0)
  const linesPerPage = 20

  const lines = content.split('\n')
  const totalPages = Math.ceil(lines.length / linesPerPage)
  const currentPage = Math.floor(scrollOffset / linesPerPage) + 1

  const visibleLines = lines.slice(scrollOffset, scrollOffset + linesPerPage)

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onClose()
    } else if (input === 'j' || key.downArrow) {
      setScrollOffset((prev) => Math.min(prev + 1, lines.length - linesPerPage))
    } else if (input === 'k' || key.upArrow) {
      setScrollOffset((prev) => Math.max(prev - 1, 0))
    } else if (key.pageDown) {
      setScrollOffset((prev) => Math.min(prev + linesPerPage, lines.length - linesPerPage))
    } else if (key.pageUp) {
      setScrollOffset((prev) => Math.max(prev - linesPerPage, 0))
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
      width="90%"
      height="80%"
    >
      {/* ヘッダー */}
      <Box paddingX={1} marginBottom={1}>
        <Text bold>{title || 'Content Viewer'}</Text>
        <Text dimColor>
          {' '}
          (Page {currentPage}/{totalPages})
        </Text>
      </Box>

      {/* コンテンツ */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {visibleLines.map((line, index) => (
          <Text key={scrollOffset + index}>{line || ' '}</Text>
        ))}
      </Box>

      {/* フッター */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>j/↓: down • k/↑: up • PgDn/PgUp: page • q/Esc: close</Text>
      </Box>
    </Box>
  )
}
