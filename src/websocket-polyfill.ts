// WebSocket polyfill for Node.js environment
import WebSocketImpl from 'ws'

// Node.js環境でWebSocketをグローバルに設定
// Phoenix.jsがブラウザのWebSocketAPIを期待するため
if (typeof global !== 'undefined') {
  // グローバルオブジェクトを拡張
  const globalWithWs = global as unknown as {
    WebSocket?: typeof WebSocketImpl
  }
  
  if (!globalWithWs.WebSocket) {
    // wsのWebSocketをグローバルに設定
    globalWithWs.WebSocket = WebSocketImpl
  }
}

export { WebSocketImpl as WebSocket }