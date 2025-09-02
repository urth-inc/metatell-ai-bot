# LiveKit インターフェイス 仕様・設計書（正式版 / PoC 最速優先）

* **文書ID**: MT-SDK-LK-NODE-IF-001
* **版**: v1.0.0（PoC 最速版）
* **前提**: Node.js 18+（推奨: Node 20 LTS）、TypeScript 5.x
* **非目的**: ブラウザサポート、SSE/WebSocket等のフォールバック、複雑な自動復旧機構、過剰なメトリクス
* **原則**:

  * **最小API**＋**最小イベント**のみ公開
  * 実装は**一枚岩（LiveKit 直結）**。抽象は**開発速度のための最小限**に留める
  * **削れるものは削る／後から足せる形**にする（EasyToChange）

---

## 1. 価値提案（PoC 開発速度のための抽象）

### 1.1 RealtimeTransport 抽象の「速度メリット」

* **関心の分離**：LiveKit 固有の接続・イベント・トラック管理を**ひとつのアダプター**に隔離。
  → Bot 本体やRAG/TTSは**LiveKit知識ゼロ**で開発を継続可能。
* **開発効率**：**軽量モック**を同じインターフェイスで用意（ダミーの接続・エコー送受信・擬似イベント）。
  → **LiveKit サーバー未準備でも本体開発を前倒し**でき、テストが即回る。

> ここでの抽象は「将来の可用性」目的ではなく、**今の速度を上げるための作業分割ツール**です。

---

## 2. 公開 API（安定インターフェイス v1）

> パッケージ（例）: `@org/realtime`
> 本APIは**Node 専用**。**フォールバック実装は存在しません**。

```ts
// Connection state
export type ConnectionState =
  | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

// Options
export interface TokenProvider { (): Promise<string>; }

export interface RealtimeOptions {
  /** wss://<livekit-host> */
  url: string;
  /** AccessToken 取得（期限切れ時も再呼び出し） */
  tokenProvider: TokenProvider;

  /** 接続オプション（必要最低限） */
  connect?: {
    autoSubscribe?: boolean; // default: true
    dynacast?: boolean;      // default: true
  };

  /** 使用する論理チャネル（topic）。未宣言topicの送信はエラーにする */
  topics?: string[]; // default: ['control','events','transcript']

  /** 音声Publish（サーバー発話） */
  audioPublish?: {
    sampleRate: 48000 | 24000 | 16000; // PCM16
    channels: 1 | 2;
    frameDurationMs?: 10 | 20;         // default: 20
    trackName?: string;                 // default: 'agent-audio'
  };

  /** タイムアウト（最低限のみ） */
  timeouts?: {
    connectMs?: number; // default: 10000
  };

  /** 速度優先の軽量ロガー */
  logger?: (level: 'debug'|'info'|'warn'|'error', msg: string, meta?: any) => void;
}

// Events
export type RealtimeEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'data'; topic: string; payload: Uint8Array; from?: string }
  | { type: 'participant-joined'; identity: string; sid: string }
  | { type: 'participant-left'; identity: string; sid: string }
  | { type: 'warning'; code: string; message: string }
  | { type: 'error'; code: string; message: string; cause?: unknown };

// Interface
export interface RealtimeTransport {
  readonly state: ConnectionState;
  on(listener: (e: RealtimeEvent) => void): () => void;

  connect(opts: RealtimeOptions): Promise<void>;
  disconnect(): Promise<void>;

  /** データ送信（PoCはreliable/ordered固定。低遅延設定は後日でOK） */
  send(topic: string, data: Uint8Array | string): Promise<void>;

  /** サーバー発話（TTS等から渡されたPCM16を配信） */
  startAudioPublisher(): Promise<void>;
  pushPcmFrame(frame: Int16Array): Promise<void>;
  stopAudioPublisher(): Promise<void>;
}
```

**設計意図（速度最優先）**

* `rpc()` や断片化・背圧等の込み入った機能は**v1では非公開**。必要なら**アダプター内に実装**して後日サーフェスへ「足す」。
* `send()` は**常に reliable/ordered**でまず成功率重視。低遅延最適化は**PoC成功後**に段階追加。

---

## 3. 実装構成（最小）

```
packages/
  realtime/
    src/
      transport.ts        // ↑のインターフェイス定義（唯一の公開窓口）
      livekit.ts          // LiveKitAdapter（Node用実装）
      mock.ts             // 超軽量モック（ローカル開発/CI用）
      errors.ts           // 文字列コードのみ（軽量）
      index.ts            // export
    package.json
```

### 3.1 LiveKitAdapter（要点のみ）

* Node 用 LiveKit SDK（例：`@livekit/rtc-node`）に**薄く**依存。
* `Room.connect(url, token)` で接続、`Room.on(DataReceived)` を **`data` イベント**にマッピング。
* `publishData(payload, { topic })` で `send()` を実装。
* 音声は `AudioSource` + `LocalAudioTrack` を作成し `publishTrack()`。`pushPcmFrame()` で `captureFrame()` に投入。
* `state` 遷移は**最小**：`idle → connecting → connected → (reconnecting) → disconnected`。多重接続は**弾く**。

擬似コード（抜粋・概念）：

```ts
import { Room, RoomEvent, AudioSource, AudioFrame, LocalAudioTrack } from '@livekit/rtc-node';

export class LiveKitAdapter implements RealtimeTransport {
  state: ConnectionState = 'idle';
  private room?: Room;
  private audio?: { source: AudioSource; track: LocalAudioTrack };
  private listeners = new Set<(e: RealtimeEvent) => void>();
  private cfg!: RealtimeOptions;

  on(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emit(e: RealtimeEvent) { this.listeners.forEach(fn => fn(e)); }
  private setState(s: ConnectionState) { if (this.state !== s) { this.state = s; this.emit({ type:'state', state:s }); } }

  async connect(opts: RealtimeOptions) {
    if (this.state === 'connecting' || this.state === 'connected') throw new Error('AlreadyConnecting');
    this.cfg = { topics: ['control','events','transcript'], ...opts };
    this.setState('connecting');

    const token = await this.cfg.tokenProvider();
    const room = new Room();
    room
      .on(RoomEvent.ParticipantConnected, p => this.emit({ type:'participant-joined', identity: p.identity ?? '', sid: p.sid }))
      .on(RoomEvent.ParticipantDisconnected, p => this.emit({ type:'participant-left', identity: p.identity ?? '', sid: p.sid }))
      .on(RoomEvent.DataReceived, (payload, p, _kind, topic) => this.emit({ type:'data', topic: topic ?? 'default', payload, from: p?.identity }))
      .on(RoomEvent.Reconnecting, () => this.setState('reconnecting'))
      .on(RoomEvent.Reconnected, () => this.setState('connected'))
      .on(RoomEvent.Disconnected, () => this.setState('disconnected'));

    await room.connect(this.cfg.url, token, {
      autoSubscribe: this.cfg.connect?.autoSubscribe ?? true,
      dynacast: this.cfg.connect?.dynacast ?? true,
    });
    this.room = room;
    this.setState('connected');
  }

  async disconnect() {
    await this.room?.disconnect();
    this.room = undefined;
    this.setState('disconnected');
  }

  async send(topic: string, data: Uint8Array | string) {
    if (!this.cfg.topics?.includes(topic)) throw new Error('UnknownTopic');
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await this.room!.localParticipant.publishData(bytes, { reliable: true, topic });
  }

  async startAudioPublisher() {
    const { sampleRate, channels, trackName, frameDurationMs } = this.cfg.audioPublish!;
    const source = new AudioSource(sampleRate, channels);
    const track = LocalAudioTrack.createAudioTrack(trackName ?? 'agent-audio', source);
    await this.room!.localParticipant.publishTrack(track);
    this.audio = { source, track };
  }

  async pushPcmFrame(frame: Int16Array) {
    if (!this.audio) throw new Error('AudioNotStarted');
    // サンプル数は (sampleRate * frameDurationMs / 1000) * channels を想定
    const { sampleRate, channels } = this.cfg.audioPublish!;
    const samples = frame.length;
    await this.audio.source.captureFrame(new AudioFrame(frame, sampleRate, channels, samples));
  }

  async stopAudioPublisher() {
    if (!this.audio) return;
    await this.audio.track.close();
    this.audio = undefined;
  }
}
```

### 3.2 MockAdapter（速度のための最小モック）

* `connect()` は 30–50ms 後に `connected` を発火。
* `send()` は**自エコー**で `data` を返す（topic つき）。
* `startAudioPublisher()` は no-op、`pushPcmFrame()` は**カウントだけ**。
  → **ライブサーバーなしでBot本体の振る舞いを即座にデバッグ可能**。

---

## 4. 振る舞い仕様（簡潔）

### 4.1 状態遷移

```
idle
 └─ connect() → connecting → connected
connected ──(ネットワークイベント)→ reconnecting → connected | disconnected
connected/disconnecting ── disconnect() → disconnected
```

* 同一状態の連続通知は禁止。
* `connect()` の多重呼び出しは禁止（`AlreadyConnecting`）。

### 4.2 データ（topic）

* 予約: `control`, `events`, `transcript`
* **未宣言の topic の送信はエラー**（バグ早期検知のため）
* v1は**常に reliable/ordered**（失敗しづらくPoC向き）

### 4.3 音声（サーバー発話）

* PCM16（LE）、可変 `sampleRate/channels`、`frameDurationMs` は 10/20ms を想定
* `pushPcmFrame()` の呼び出しレートは**フレーム境界**を尊重（過不足はアダプター内で警告）

### 4.4 エラー/警告（最小セット）

| code                | 例                 | 呼び出し側                     |
| ------------------- | ----------------- | ------------------------- |
| `AlreadyConnecting` | `connect` 多重      | 呼び出し制御                    |
| `UnknownTopic`      | 未宣言topic送信        | topic定義修正                 |
| `AudioNotStarted`   | `pushPcmFrame` 先行 | `startAudioPublisher` を先に |

---

## 5. 最小導入手順（**速度優先**）

> **重要**：フォールバック関連のコードは**すべて削除**してください（条件分岐、代替トランスポート、冗長な再接続戦略を含む）。

1. **削除（必須）**

   * 既存の SSE/WebSocket 等、LiveKit 以外のトランスポート実装・分岐・設定値を**完全削除**。
   * 「接続方式を選ぶ」フラグ・環境変数・ドキュメントも**削除**。

2. **パッケージ新設** `packages/realtime`

   * `transport.ts` に**公開インターフェイス**（§2）を定義。
   * `livekit.ts` に **LiveKitAdapter**（§3.1）実装。
   * `mock.ts` に **MockAdapter**（§3.2）実装。
   * `index.ts` で `export { LiveKitAdapter, MockAdapter, RealtimeTransport, ... }`。

3. **依存追加**

   * LiveKit Node SDK（例：`@livekit/rtc-node`）と型依存。
   * ビルドは ESM/CJS どちらか片方（**速さ優先**なら ESM のみ）に固定可。

4. **Bot 本体の差し替え**

   * 既存の「リアルタイム送受信ポイント」で `RealtimeTransport` を注入。
   * 本番：`new LiveKitAdapter()` を使用。ローカル/CI：`new MockAdapter()` を使用。
   * データ送信は `send('control'|'events'|'transcript', data)` に1本化。

5. **トークン取得（最小）**

   * `tokenProvider` は**固定URL**に GET して JWT を返すだけの最小実装でよい（認証や権限はPoC範囲で簡略）。
   * 期限切れ時は `connect()` からの例外で検知したら**都度再取得**（v1では自動更新を入れない）。

6. **TTS 連携（最短経路）**

   * TTS の PCM16 を `pushPcmFrame()` にそのまま流す。
   * チャンネル数・フレーム長だけ**呼び出し側で揃える**（変換は後回し）。

7. **ロギング**

   * `logger` に既存のロガを渡す（レベル4種）。**構造は自由**。

---

## 6. サンプル利用コード（PoC 用）

```ts
import { LiveKitAdapter } from '@org/realtime';

const rt = new LiveKitAdapter();

rt.on(e => {
  if (e.type === 'state') console.log('[state]', e.state);
  if (e.type === 'data')  console.log('[data]', e.topic, new TextDecoder().decode(e.payload));
});

await rt.connect({
  url: process.env.LK_URL!,
  tokenProvider: async () => fetch(`${process.env.API_BASE}/livekit/token`).then(r => r.text()),
  topics: ['control','events','transcript'],
  audioPublish: { sampleRate: 24000, channels: 1, frameDurationMs: 20 },
});

// 送信
await rt.send('control', JSON.stringify({ cmd: 'hello' }));

// 音声 publish
await rt.startAudioPublisher();
// TTS から届いた PCM16 を適切なフレーム間隔で:
await rt.pushPcmFrame(pcmInt16Frame);

// 終了
await rt.disconnect();
```

---

## 7. ビルド/配布（最小）

* `tsconfig` は **strict** を推奨（型崩れで速度が落ちる事故を防ぐ）。
* ESM 単独ビルドでよい（CJS 併用は後回し）。
* テストは MockAdapter 中心で**ユニット即時化**：`connect()/send()/events` のみ。

---

## 8. 今回あえて**やらない**こと（PoCでの割り切り）

* DataChannel の lossy/ordered/背圧最適化、断片化、QoS 切り替え
* 高度な再接続・自動トークンローテーション・メトリクス可視化
* RPC（必要になれば adapter 内私有APIとして先に実装→後で公開）

> これらは**後で足せる**。v1 API は**最小の不変核**に限定しているため、機能追加は非破壊で進められる。

---

## 9. 受け入れ基準（PoC 完了の定義）

* **接続〜送受信〜切断**が**安定**して 100 回連続成功
* `control/events/transcript` の 3 topic で**往復確認**
* TTS フレーム（10/20ms, 16k/24k/48k, mono）を**5分連続**送出して例外なし
* 例外は `AlreadyConnecting / UnknownTopic / AudioNotStarted` の範囲に収束

---

## 10. ロードマップ（PoC後の“足しやすい”拡張）

1. `send()` に `reliability?: 'lossy'|'reliable'` を追加（既定は `reliable` 据え置き）
2. 遅延/断片化/背圧の最小制御（必要になったら）
3. 軽量 `rpc()` の公開（adapter 内実装を昇格）
4. 接続再試行/トークン自動更新の**薄い**実装（PoC成功後）

