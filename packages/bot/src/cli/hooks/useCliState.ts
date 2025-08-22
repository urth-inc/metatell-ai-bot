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
  | { type: 'SELECT_SUGGESTION'; index: number }
  | { type: 'SET_FILTER'; regex?: RegExp }
  | { type: 'SHOW_MODAL'; title: string; content: string }
  | { type: 'CLOSE_MODAL' }
  | { type: 'CTRL_C_PRESSED' }
  | { type: 'START_SEARCH' }
  | { type: 'STOP_SEARCH' }
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

    case 'ADD_LOGS':
      return {
        ...state,
        logs: [...state.logs, ...action.logs].slice(-1000), // Keep last 1000 logs
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

    case 'SELECT_SUGGESTION':
      return {
        ...state,
        selectedSuggestionIndex: Math.max(0, Math.min(action.index, state.suggestions.length - 1)),
      }

    case 'SET_FILTER':
      return { ...state, filterRegex: action.regex }

    case 'SHOW_MODAL':
      return {
        ...state,
        modalContent: { title: action.title, content: action.content },
      }

    case 'CLOSE_MODAL':
      return { ...state, modalContent: undefined }

    case 'CTRL_C_PRESSED':
      return { ...state, lastCtrlC: Date.now() }

    case 'START_SEARCH':
      return { ...state, isSearching: true, searchQuery: '' }

    case 'STOP_SEARCH':
      return { ...state, isSearching: false, searchQuery: '' }

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
