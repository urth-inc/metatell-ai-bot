// WebSocket polyfill for Node.js environment
import WebSocketImpl from 'ws'

// Set WebSocket globally in Node.js environment
// Because Phoenix.js expects the browser's WebSocket API
if (typeof global !== 'undefined') {
  // Extend the global object
  const globalWithWs = global as unknown as {
    WebSocket?: typeof WebSocketImpl
  }

  if (!globalWithWs.WebSocket) {
    // Set ws WebSocket globally
    globalWithWs.WebSocket = WebSocketImpl
  }
}

export { WebSocketImpl as WebSocket }
