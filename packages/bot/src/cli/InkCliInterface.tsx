import type { AgentClient, RingBufferLike } from '@metatell/sdk'
import { getLogger, getLogEventEmitter, getRingBuffer } from '@metatell/sdk'
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

  const logger = getLogger('CLI')
  const executor = useMemo(
    () => new CommandExecutor(client, commandContext),
    [client, commandContext],
  )

  // 初期化：バッファされたログを取得とイベント購読
  useEffect(() => {
    // 既存のバッファされたログを取得
    const rb = getRingBuffer() as RingBufferLike
    const logs = rb.drainNew ? rb.drainNew() : rb.drain()
    if (logs.length > 0) {
      addLogs(logs)
    }

    // イベント駆動でログを受信
    const logEmitter = getLogEventEmitter()
    const unsubscribe = logEmitter.onNewLogs((newLogs) => {
      if (newLogs.length > 0) {
        addLogs(newLogs)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [addLogs])

  // 高さ計算
  const terminalHeight = stdout?.rows || 24
  const headerHeight = state.filterRegex || client.getStatus().connecting ? 4 : 3
  const footerHeight = state.suggestions.length > 0 ? 6 : 4
  const logPaneHeight = Math.max(5, terminalHeight - headerHeight - footerHeight)

  // コマンド補完
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

  // ログコマンドの処理
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
          // デフォルト動作
          break
      }
    },
    [logger, dispatch],
  )

  // コマンド実行
  const handleCommand = useCallback(
    async (input: string) => {
      if (!input.trim()) return

      // コマンド履歴に追加
      dispatch({ type: 'ADD_TO_HISTORY', command: input })

      // ログに記録
      logger.info(input, { type: 'command' })

      // コマンド解析と実行
      const plan = parseCommand(input)

      // 特殊コマンドの処理
      if (plan.kind === 'quit') {
        exit()
        return
      }

      if (plan.kind === 'logs') {
        handleLogsCommand(plan)
        return
      }

      // 通常コマンドの実行
      try {
        const result = await executor.execute(plan)
        if (result.message) {
          const level = result.success ? 'info' : 'error'
          logger[level](result.message)
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

  // キーボード入力処理
  useInput(
    (input, key) => {
      // モーダル表示中は無視
      if (state.modalContent) {
        return
      }

      // Ctrl+C処理
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

      // Ctrl+R: 履歴検索
      if (key.ctrl && input === 'r') {
        dispatch({ type: 'SET_SEARCH_MODE', isSearching: true })
        return
      }

      // Esc: フィルタ解除・検索終了
      if (key.escape) {
        dispatch({ type: 'CLEAR_FILTER' })
        dispatch({ type: 'SET_SEARCH_MODE', isSearching: false })
        dispatch({ type: 'RESET_INPUT' })
        return
      }

      // 履歴ナビゲーション
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

      // Tab補完
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

  // 接続状態の取得
  const status = client.getStatus()
  const userCount = client.getUsers().length

  return (
    <Box flexDirection="column" height="100%">
      <Header
        status={status.connected ? 'connected' : status.connecting ? 'connecting' : 'disconnected'}
        userCount={userCount}
        rtt={status.rtt}
        retries={status.retries}
        rateLimit={client.getRateLimit('messages')}
        filterRegex={state.filterRegex?.source}
        reconnectProgress={
          status.connecting
            ? {
                retryIn: 5, // TODO: 実際の値を取得
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
          await handleCommand(value)
          dispatch({ type: 'RESET_INPUT' })
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
