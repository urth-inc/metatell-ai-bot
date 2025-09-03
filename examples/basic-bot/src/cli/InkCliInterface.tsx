import type { AgentClient, RingBufferLike } from '@metatell/sdk'
import { getLogEventEmitter, getLogger, getRingBuffer } from '@metatell/sdk'
import { Box, useApp, useInput, useStdout } from 'ink'
import type React from 'react'
import { useCallback, useEffect, useMemo } from 'react'
import type { CommandContext } from '../bots/commands/BotCommand.js'
import { CommandExecutor } from './commands/exec.js'
import { COMMANDS, type CommandPlan, parseCommand } from './commands/plan.js'
import { Footer } from './components/Footer.js'
import { Header } from './components/Header.js'
import { LogPane } from './components/LogPane.js'
import { Modal } from './components/Modal.js'
import { useCliState } from './hooks/useCliState.js'

interface CliInterfaceProps {
  client: AgentClient
  commandContext: CommandContext
}

/**
 * Main CLI interface component with 3-pane layout
 */
export const InkCliInterface: React.FC<CliInterfaceProps> = ({ client, commandContext }) => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { state, dispatch, setInput, addLogs, showModal, closeModal } = useCliState()

  const logger = getLogger('InkCLI')
  const executor = useMemo(
    () => new CommandExecutor(client, commandContext),
    [client, commandContext],
  )

  // Initialize: Get buffered logs and subscribe to events
  useEffect(() => {
    // First, subscribe to events to avoid missing any logs
    const logEmitter = getLogEventEmitter()
    const unsubscribe = logEmitter.onNewLogs((newLogs) => {
      if (newLogs.length > 0) {
        addLogs(newLogs)
      }
    })

    // Then get existing buffered logs
    const rb = getRingBuffer() as RingBufferLike
    const logs = rb.drainNew ? rb.drainNew() : rb.drain()
    if (logs.length > 0) {
      addLogs(logs)
    }

    return () => {
      unsubscribe()
    }
  }, [addLogs])

  // Height calculation
  const terminalHeight = stdout?.rows || 24
  const headerHeight = state.filterRegex || client.getStatus().connecting ? 4 : 3
  const footerHeight = state.suggestions.length > 0 ? 6 : 4
  const logPaneHeight = Math.max(5, terminalHeight - headerHeight - footerHeight)

  // Command completion
  useEffect(() => {
    if (!state.isSearching && state.input.startsWith('/')) {
      const filtered = COMMANDS.filter((cmd) => cmd.command.startsWith(state.input))
      const suggestions = filtered.slice(0, 5).map((cmd) => ({
        command: cmd.command,
        description: cmd.description,
      }))
      dispatch({ type: 'SET_SUGGESTIONS', suggestions })
    } else if (!state.isSearching) {
      dispatch({ type: 'SET_SUGGESTIONS', suggestions: [] })
    }
  }, [state.input, state.isSearching, dispatch])

  // Log command processing
  const handleLogsCommand = useCallback(
    (plan: Extract<CommandPlan, { kind: 'logs' }>) => {
      switch (plan.subcommand) {
        case 'clear':
          getRingBuffer()?.clear()
          dispatch({ type: 'SET_LOGS', logs: [] })
          logger.info('Log history cleared')
          break

        case 'filter':
          if (plan.arg) {
            try {
              const regex = new RegExp(plan.arg)
              dispatch({ type: 'SET_FILTER', filterRegex: regex })
              logger.info(`Filter applied: /${plan.arg}/`)
            } catch (_error) {
              logger.error(`Invalid regex: ${plan.arg}`)
            }
          }
          break

        case 'tail':
          // Default behavior
          break
      }
    },
    [logger, dispatch],
  )

  // Command execution
  const handleCommand = useCallback(
    async (input: string) => {
      if (!input.trim()) return

      // Add to command history
      dispatch({ type: 'ADD_TO_HISTORY', command: input })

      // Parse and execute command
      const plan = parseCommand(input)

      // Special command handling
      if (plan.kind === 'quit') {
        exit()
        return
      }

      if (plan.kind === 'logs') {
        handleLogsCommand(plan)
        return
      }

      // Execute normal command
      try {
        const result = await executor.execute(plan)
        if (result.message) {
          if (result.success) {
            logger.info(result.message)
          } else {
            logger.error(result.message)
          }
        }
        if (result.showModal && result.data) {
          showModal(input, String(result.data))
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`)
      }
    },
    [executor, exit, logger, dispatch, handleLogsCommand, showModal],
  )

  // Keyboard input handling
  useInput(
    (input, key) => {
      // Ignore when modal is showing
      if (state.modalContent) {
        return
      }

      // Ctrl+C handling
      if (key.ctrl && input === 'c') {
        const now = Date.now()
        if (now - state.lastCtrlC < 2000) {
          exit()
        } else {
          dispatch({ type: 'SET_LAST_CTRL_C', timestamp: now })
          dispatch({ type: 'RESET_INPUT' })
          logger.info('Press Ctrl+C again to exit')
        }
        return
      }

      // Ctrl+R: History search
      if (key.ctrl && input === 'r') {
        dispatch({ type: 'SET_SEARCH_MODE', isSearching: true })
        return
      }

      // Esc: Clear filter/end search
      if (key.escape) {
        dispatch({ type: 'CLEAR_FILTER' })
        dispatch({ type: 'SET_SEARCH_MODE', isSearching: false })
        dispatch({ type: 'RESET_INPUT' })
        return
      }

      // History navigation
      if (key.upArrow) {
        if (state.suggestions.length > 0) {
          dispatch({ type: 'SELECT_PREVIOUS_SUGGESTION' })
        } else if (state.commandHistory.length > 0 && !state.isSearching) {
          dispatch({ type: 'NAVIGATE_HISTORY', direction: 'up' })
        }
        return
      }

      if (key.downArrow) {
        if (state.suggestions.length > 0) {
          dispatch({ type: 'SELECT_NEXT_SUGGESTION' })
        } else if (
          state.commandHistory.length > 0 &&
          state.historyIndex !== -1 &&
          !state.isSearching
        ) {
          dispatch({ type: 'NAVIGATE_HISTORY', direction: 'down' })
        }
        return
      }

      // Tab completion
      if (key.tab && state.suggestions.length > 0) {
        const selected = state.suggestions[state.selectedSuggestionIndex]
        if (selected) {
          dispatch({ type: 'SET_INPUT', input: `${selected.command} ` })
          dispatch({ type: 'SET_SUGGESTIONS', suggestions: [] })
        }
        return
      }
    },
    { isActive: process.stdin.isTTY },
  )

  // Get connection status
  const status = client.getStatus()
  const userCount = client.getUsers().length

  return (
    <Box flexDirection="column" height="100%">
      <Header
        status={status.connected ? 'connected' : status.connecting ? 'connecting' : 'disconnected'}
        userCount={userCount}
        rtt={status.rtt || 0}
        retries={status.retries || 0}
        rateLimit={client.getRateLimit('messages')}
        filterRegex={state.filterRegex?.source}
        reconnectProgress={
          status.connecting
            ? {
                retryIn: 5, // TODO: Get actual value
                progress: 0.3,
              }
            : undefined
        }
      />

      <LogPane logs={state.logs} filterRegex={state.filterRegex} height={logPaneHeight} />

      <Footer
        input={state.input}
        onChange={(value) => setInput(value)}
        onSubmit={async (value) => {
          dispatch({ type: 'RESET_INPUT' })
          await handleCommand(value)
        }}
        suggestions={state.suggestions}
        selectedSuggestionIndex={state.selectedSuggestionIndex}
      />

      {state.modalContent && (
        <Modal
          title={state.modalContent.title}
          content={state.modalContent.content}
          onClose={closeModal}
        />
      )}
    </Box>
  )
}
