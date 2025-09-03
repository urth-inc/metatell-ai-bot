import type { CoreLogRecord as LogRecord } from '@metatell/sdk'
import { useReducer } from 'react'

// State types
export interface CliState {
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

// Action types
export type CliAction =
  | { type: 'SET_LOGS'; logs: LogRecord[] }
  | { type: 'ADD_LOGS'; logs: LogRecord[] }
  | { type: 'SET_INPUT'; input: string }
  | { type: 'ADD_TO_HISTORY'; command: string }
  | { type: 'NAVIGATE_HISTORY'; direction: 'up' | 'down' }
  | { type: 'SET_SUGGESTIONS'; suggestions: Array<{ command: string; description: string }> }
  | { type: 'SELECT_NEXT_SUGGESTION' }
  | { type: 'SELECT_PREVIOUS_SUGGESTION' }
  | { type: 'SET_FILTER'; filterRegex?: RegExp }
  | { type: 'CLEAR_FILTER' }
  | { type: 'SHOW_MODAL'; title: string; content: string }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SET_LAST_CTRL_C'; timestamp: number }
  | { type: 'SET_SEARCH_MODE'; isSearching: boolean }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'RESET_INPUT' }

// Initial state
export const initialCliState: CliState = {
  logs: [],
  input: '',
  commandHistory: [],
  historyIndex: -1,
  suggestions: [],
  selectedSuggestionIndex: 0,
  lastCtrlC: 0,
  isSearching: false,
  searchQuery: '',
}

// Reducer
export function cliReducer(state: CliState, action: CliAction): CliState {
  switch (action.type) {
    case 'SET_LOGS':
      return { ...state, logs: action.logs }

    case 'ADD_LOGS': {
      // Deduplicate logs by timestamp and message content
      const existingKeys = new Set(state.logs.map((log) => `${log.ts}-${log.module}-${log.msg}`))
      const newLogs = action.logs.filter((log) => {
        const key = `${log.ts}-${log.module}-${log.msg}`
        return !existingKeys.has(key)
      })
      return {
        ...state,
        logs: [...state.logs, ...newLogs].slice(-1000), // Keep last 1000 logs
      }
    }

    case 'SET_INPUT':
      return { ...state, input: action.input }

    case 'ADD_TO_HISTORY':
      return {
        ...state,
        commandHistory: [...state.commandHistory, action.command],
        historyIndex: -1,
      }

    case 'NAVIGATE_HISTORY': {
      if (state.commandHistory.length === 0) return state

      let newIndex = state.historyIndex
      if (action.direction === 'up') {
        newIndex =
          state.historyIndex === -1
            ? state.commandHistory.length - 1
            : Math.max(0, state.historyIndex - 1)
      } else {
        newIndex = Math.min(state.commandHistory.length - 1, state.historyIndex + 1)
        if (newIndex === state.commandHistory.length - 1) {
          newIndex = -1
        }
      }

      return {
        ...state,
        historyIndex: newIndex,
        input: newIndex === -1 ? '' : state.commandHistory[newIndex],
      }
    }

    case 'SET_SUGGESTIONS':
      return {
        ...state,
        suggestions: action.suggestions,
        selectedSuggestionIndex: 0,
      }

    case 'SELECT_NEXT_SUGGESTION':
      return {
        ...state,
        selectedSuggestionIndex: Math.min(
          state.suggestions.length - 1,
          state.selectedSuggestionIndex + 1,
        ),
      }

    case 'SELECT_PREVIOUS_SUGGESTION':
      return {
        ...state,
        selectedSuggestionIndex: Math.max(0, state.selectedSuggestionIndex - 1),
      }

    case 'SET_FILTER':
      return { ...state, filterRegex: action.filterRegex }

    case 'CLEAR_FILTER':
      return { ...state, filterRegex: undefined }

    case 'SHOW_MODAL':
      return {
        ...state,
        modalContent: { title: action.title, content: action.content },
      }

    case 'CLOSE_MODAL':
      return { ...state, modalContent: undefined }

    case 'SET_LAST_CTRL_C':
      return { ...state, lastCtrlC: action.timestamp }

    case 'SET_SEARCH_MODE':
      return { ...state, isSearching: action.isSearching, searchQuery: '' }

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query }

    case 'RESET_INPUT':
      return {
        ...state,
        input: '',
        suggestions: [],
        selectedSuggestionIndex: 0,
      }

    default:
      return state
  }
}

// Custom hook
export function useCliState() {
  const [state, dispatch] = useReducer(cliReducer, initialCliState)

  return {
    state,
    dispatch,
    // Helper actions for common operations
    setInput: (input: string) => dispatch({ type: 'SET_INPUT', input }),
    addLogs: (logs: LogRecord[]) => dispatch({ type: 'ADD_LOGS', logs }),
    showModal: (title: string, content: string) => dispatch({ type: 'SHOW_MODAL', title, content }),
    closeModal: () => dispatch({ type: 'CLOSE_MODAL' }),
    resetInput: () => dispatch({ type: 'RESET_INPUT' }),
  }
}
