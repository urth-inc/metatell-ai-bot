import type { AgentClient, LogRecord, RingBufferLike } from '@metatell/sdk'
import { getLogger, getRingBuffer } from '@metatell/sdk'
import { Box, useApp, useInput, useStdout } from 'ink'
import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CommandExecutor } from './commands/exec.js'
import { COMMANDS, type CommandPlan, parseCommand } from './commands/plan.js'
import { Footer } from './components/Footer.js'
import { Header } from './components/Header.js'
import { LogPane } from './components/LogPane.js'
import { Modal } from './components/Modal.js'
import { EventQueue } from './runtime/EventQueue.js'

interface CliInterfaceProps {
  client: AgentClient
}

interface UIState {
  logs: LogRecord[]
  input: string
  commandHistory: string[]
  historyIndex: number
  suggestions: Array<{ command: string; description: string }>
  selectedSuggestionIndex: number
  filterRegex?: RegExp
  modalContent?: {
    title: string
    content: string
  }
  lastCtrlC: number
  isSearching: boolean
  searchQuery: string
}

/**
 * Main CLI interface component with 3-pane layout
 */
export const InkCliInterface: React.FC<CliInterfaceProps> = ({ client }) => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [state, setState] = useState<UIState>({
    logs: [],
    input: '',
    commandHistory: [],
    historyIndex: -1,
    suggestions: [],
    selectedSuggestionIndex: 0,
    lastCtrlC: 0,
    isSearching: false,
    searchQuery: '',
  })

  const logger = getLogger('CLI')
  const executor = new CommandExecutor(client)

  // イベントキューでバッチ更新（useMemoで安定化）
  const eventQueue = useMemo(
    () =>
      new EventQueue<Partial<UIState>>((updates) => {
        setState((prev) => {
          let next = { ...prev }
          for (const update of updates) {
            next = { ...next, ...update }
          }
          return next
        })
      }),
    [],
  )

  // 初期化：バッファされたログを取得
  useEffect(() => {
    const rb = getRingBuffer() as RingBufferLike
    const logs = rb.drainNew ? rb.drainNew() : rb.drain()
    eventQueue.push({ logs })

    // ログシステムのリスナー設定
    const interval = setInterval(() => {
      const rb = getRingBuffer() as RingBufferLike
      const newLogs = rb.drainNew ? rb.drainNew() : rb.drain()
      if (newLogs.length > 0) {
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs, ...newLogs].slice(-1000), // 最大1000件
        }))
      }
    }, 100)

    return () => clearInterval(interval)
  }, [eventQueue]) // EventQueueはuseMemoで安定参照

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
      eventQueue.push({ suggestions, selectedSuggestionIndex: 0 })
    } else if (!state.isSearching) {
      eventQueue.push({ suggestions: [], selectedSuggestionIndex: 0 })
    }
  }, [state.input, state.isSearching, eventQueue])

  // ログコマンドの処理
  const handleLogsCommand = useCallback(
    (plan: Extract<CommandPlan, { kind: 'logs' }>) => {
      switch (plan.subcommand) {
        case 'clear':
          getRingBuffer()?.clear()
          eventQueue.push({ logs: [] })
          logger.info('Log history cleared')
          break

        case 'filter':
          if (plan.arg) {
            try {
              const regex = new RegExp(plan.arg)
              eventQueue.push({ filterRegex: regex })
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
    [logger, eventQueue],
  )

  // コマンド実行
  const handleCommand = useCallback(
    async (input: string) => {
      if (!input.trim()) return

      // コマンド履歴に追加
      const newHistory = [...state.commandHistory, input].slice(-100)
      eventQueue.push({ commandHistory: newHistory, historyIndex: -1 })

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
          eventQueue.push({
            modalContent: {
              title: input,
              content: String(result.data),
            },
          })
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`)
      }
    },
    [state.commandHistory, executor, exit, logger, eventQueue, handleLogsCommand],
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
          eventQueue.push({
            input: '',
            suggestions: [],
            historyIndex: -1,
            lastCtrlC: now,
            isSearching: false,
            searchQuery: '',
          })
          logger.info('Press Ctrl+C again to exit')
        }
        return
      }

      // Ctrl+R: 履歴検索
      if (key.ctrl && input === 'r') {
        eventQueue.push({ isSearching: true, searchQuery: '' })
        return
      }

      // Esc: フィルタ解除・検索終了
      if (key.escape) {
        eventQueue.push({
          filterRegex: undefined,
          isSearching: false,
          searchQuery: '',
          input: '',
          suggestions: [],
          historyIndex: -1,
        })
        return
      }

      // 履歴ナビゲーション
      if (key.upArrow) {
        if (state.suggestions.length > 0) {
          eventQueue.push({
            selectedSuggestionIndex: Math.max(0, state.selectedSuggestionIndex - 1),
          })
        } else if (state.commandHistory.length > 0 && !state.isSearching) {
          const newIndex =
            state.historyIndex === -1
              ? state.commandHistory.length - 1
              : Math.max(0, state.historyIndex - 1)
          eventQueue.push({
            historyIndex: newIndex,
            input: state.commandHistory[newIndex] || '',
          })
        }
        return
      }

      if (key.downArrow) {
        if (state.suggestions.length > 0) {
          eventQueue.push({
            selectedSuggestionIndex: Math.min(
              state.suggestions.length - 1,
              state.selectedSuggestionIndex + 1,
            ),
          })
        } else if (
          state.commandHistory.length > 0 &&
          state.historyIndex !== -1 &&
          !state.isSearching
        ) {
          const newIndex = state.historyIndex + 1
          if (newIndex >= state.commandHistory.length) {
            eventQueue.push({ historyIndex: -1, input: '' })
          } else {
            eventQueue.push({
              historyIndex: newIndex,
              input: state.commandHistory[newIndex] || '',
            })
          }
        }
        return
      }

      // Tab補完
      if (key.tab && state.suggestions.length > 0) {
        const selected = state.suggestions[state.selectedSuggestionIndex]
        if (selected) {
          eventQueue.push({
            input: `${selected.command} `,
            suggestions: [],
            selectedSuggestionIndex: 0,
            historyIndex: -1,
          })
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
        onChange={(value) => eventQueue.push({ input: value, historyIndex: -1 })}
        onSubmit={async (value) => {
          await handleCommand(value)
          eventQueue.push({ input: '', historyIndex: -1, suggestions: [] })
        }}
        suggestions={state.suggestions}
        selectedSuggestionIndex={state.selectedSuggestionIndex}
      />

      {state.modalContent && (
        <Modal
          title={state.modalContent.title}
          content={state.modalContent.content}
          onClose={() => eventQueue.push({ modalContent: undefined })}
        />
      )}
    </Box>
  )
}
