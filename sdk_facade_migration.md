### **Metatell AI Bot SDK - 公開API設計仕様書 v2.1**

#### **1. 目的とスコープ**

##### **1.1. 目的**

本SDKの目的は、外部開発者がMetatellボットを開発する際に、\*\*シンプルかつ直感的なAPI（ファサード）\*\*を提供することです。内部の複雑な実装（DIコンテナ、サービスファクトリ、NAFプロトコルの詳細など）を完全に隠蔽し、学習コストを最小限に抑えます。

##### **1.2. スコープ**

  * **IN SCOPE:**
      * 接続、チャット送受信、アバター操作、音声再生（PCM）、アニメーション実行のシンプルなAPI
      * 型安全なイベントハンドリング
      * 明確なエラーハンドリング機構
      * 基本的な音声ユーティリティ（リサンプリング、チャンキング）
  * **OUT OF SCOPE:**
      * SDK内部でのTTS/STT実装（外部サービスの利用を前提）
      * MP3/OGGなど圧縮音声のデコード
      * DIコンテナ、サービスファクトリ等の内部概念の公開

-----

#### **2. アーキテクチャの主要な変更点：責務の明確化**

本設計の核心は、**ディレクトリ構造の変更による責務の分離**です。これにより、SDKの公開範囲と内部実装を明確に分け、利用者が混乱することなく導入できるようにします。

##### **2.1. SDKの内部実装と公開ファサードの分離 (`core`と`sdk`)**

SDKの実装を、内部用の`core`と公開用の`sdk`に明確に分割します。

  * **変更前 (Before):**

      * `packages/sdk/`: 内部実装（サービス、DIコンテナ等）と公開したいAPIが混在。

  * **変更後 (After):**

      * `packages/core/`: (旧 `packages/sdk` の実装が移行) **内部実装用パッケージ**。DIコンテナ、各種サービスクラス、NAFプロトコル変換などの複雑なロジックをすべて含みます。**外部開発者はこのパッケージを直接利用しません。**
      * `packages/sdk/`: (**新規に近い構成**) **公開ファサード用パッケージ**。本仕様書で定義する`MetatellClient`のみを公開する、非常に薄いラッパーです。内部で`@metatell/core`を利用しますが、その詳細は隠蔽します。

これにより、「複雑な部分は`core`にあり、私たちが使うのはシンプルな`sdk`だけ」という明確なメッセージを開発者に伝えることができます。

##### **2.2. BotとCLI実装のサンプル化 (`examples`)**

BotやCLIはSDKのライブラリ機能ではなく、**SDKの利用例**であるため、`packages`から`examples`へ移動します。

  * **変更前 (Before):**

      * `packages/bot/`: SDKの一部として、特定のBotアプリケーションがパッケージ管理されている。

  * **変更後 (After):**

      * `examples/basic-bot/`: (旧 `packages/bot`) SDKの**利用例**として配置。SDKを使ってBotを実装する際の参考になります。
      * `examples/cli-tool/`: (旧 `packages/bot/src/cli`) 同様に、CLIツールとしての利用例として配置します。

これにより、SDKという「再利用可能な部品」と、それを使った「具体的なアプリケーション例」を明確に分離します。

-----

#### **3. 設計原則**

  * **Simple Facade:** 複雑な内部実装を隠蔽し、単一の`MetatellClient`オブジェクトを通じてすべての操作を提供します。
  * **Type Safety:** TypeScriptの能力を最大限に活用し、イベントやAPIの戻り値に厳密な型を定義することで、開発時のミスを減らします。
  * **Clear Boundaries:** SDKの責務は「Metatellとの通信と操作」に限定します。TTSの呼び出しやビジネスロジックは利用側の責務とします。
  * **Extensibility:** 将来的な機能追加が、既存のAPIを破壊しない形で容易に行える設計とします。

-----

#### **4. 公開API仕様 (`@metatell/sdk`)**

##### **4.1. エントリーポイント**

SDKの利用は常にこの関数から開始します。

```typescript
/**
 * MetatellClientのインスタンスを生成し、初期化します。
 * @param options クライアント設定
 * @returns MetatellClientのインスタンス
 * @throws {MetatellError} 設定が不正な場合にスローされます。
 */
export function createMetatellClient(options: CreateClientOptions): MetatellClient;
```

##### **4.2. `MetatellClient` インターフェイス**

これがSDKのメインとなるファサードです。

```typescript
export interface MetatellClient {
  /**
   * Metatellサーバーに接続し、指定されたルームに参加します。
   * @throws {AuthError} 認証トークンが無効な場合。
   * @throws {NetworkError} ネットワーク接続に失敗した場合。
   */
  connect(): Promise<void>;

  /**
   * サーバーから切断します。
   */
  disconnect(): Promise<void>;

  /** ルーム関連の操作 */
  readonly room: {
    /** 現在ルームに参加しているユーザーの一覧を取得します。 */
    getUsers(): Promise<User[]>;
  };

  /** チャット関連の操作 */
  readonly chat: {
    /** ルーム全体にメッセージを送信します。 */
    send(text: string): Promise<void>;

    /**
     * ボットへのメンションを購読します。
     * SDKが"@ボット名"の形式を自動で解析し、メンション以降のテキストを渡します。
     */
    onMention(handler: (event: {
      from: User;
      text: string;
      /** 受信したメッセージに簡易返信するユーティリティ関数 */
      reply: (text: string) => Promise<void>;
    }) => void): void;
  };

  /** ボットアバターの操作 */
  readonly avatar: {
    /**
     * アバターを選択・変更します。
     * @param assetId 組織アバターのIDなど
     */
    select(assetId: string): Promise<void>;

    /**
     * アニメーションを再生します。
     * @param animation 再生するアニメーションの仕様
     * @throws {NotFoundError} 指定されたアニメーションが存在しない場合。
     */
    play(animation: Animation): Promise<void>;

    /**
     * 指定された座標に移動します。
     * @param position 移動先の座標（メートル）
     */
    moveTo(position: Vec3): Promise<void>;

    /**
     * 指定された角度に回転します。
     * @param rotation 回転角度（オイラー角・度数法）
     */
    rotateTo(rotation: Euler): Promise<void>;

    /** 利用可能なアバターアセットの一覧を取得します。 */
    getAvailableAssets(): Promise<AvatarAsset[]>;

    /** 現在のアバターで利用可能なアニメーションの一覧を取得します。 */
    getAvailableAnimations(): Promise<Animation[]>;
  };

  /** 音声関連の操作 */
  readonly voice: {
    /**
     * 16-bit PCMデータを注入し、ボットに発話させます。
     * SDKは内部で48kHz/monoにリサンプリングし、10msのフレームに分割して送信します。
     * @param input Int16Array, AsyncIterable<Int16Array>, またはNodeJS.ReadableStream
     * @param options 入力PCMのフォーマット
     * @returns 再生を制御するためのオブジェクト
     * @throws {UnsupportedAudioFormatError} サポート外のフォーマットが指定された場合。
     */
    playPcm(input: PcmInput, options: PcmInputOptions): Promise<PlaybackControls>;
  };

  /** ボット自身の情報を取得します。 */
  getInfo(): Promise<BotInfo>;

  /**
   * SDKのイベントを購読します。
   * @param event イベント名
   * @param listener イベントハンドラ
   */
  on<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): void;

  /**
   * SDKのイベント購読を解除します。
   */
  off<E extends keyof MetatellClientEvents>(event: E, listener: MetatellClientEvents[E]): void;
}
```

##### **4.3. 主要な型定義**

```typescript
// --- 基本型 ---
export type Vec3 = { x: number; y: number; z: number }; // 単位: メートル
export type Euler = { x: number; y: number; z: number }; // 単位: 度
export type User = { id: string; name: string | null };
export type BotInfo = { name: string; version: string; roomId: string };
export type AvatarAsset = { id: string; name: string; tags?: string[] };
export type Animation = { name: string; loop?: boolean; speed?: number };

// --- 設定オプション ---
export interface CreateClientOptions {
  serverUrl: string;       // ws(s)://...
  roomId: string;
  token: string;           // 短命JWTを想定
  logger?: 'silent' | 'info' | 'debug'; // ログレベル
  reconnect?: { enabled?: boolean; maxDelayMs?: number };
}

// --- 音声関連 ---
export type PcmInput = Int16Array | AsyncIterable<Int16Array> | NodeJS.ReadableStream;
export interface PcmInputOptions {
  sampleRateHz: number; // 16000, 24000, 48000 など
  channels: 1 | 2;
}
export interface PlaybackControls {
  /** 現在の音声再生を即座に停止します。 */
  stop(): Promise<void>;
  /** 再生が完了したときに解決されるPromise */
  finished: Promise<void>;
}


// --- 型安全なイベント ---
export interface MetatellClientEvents {
  'connected': () => void;
  'disconnected': (reason?: string) => void;
  'error': (error: MetatellError) => void;
  'chat-message': (message: { from: User; text: string }) => void;
  'user-join': (user: User) => void;
  'user-leave': (user: User) => void;
}

// --- エラークラス ---
export class MetatellError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) { super(message); }
}
export class AuthError extends MetatellError {}
export class NetworkError extends MetatellError {}
export class NotFoundError extends MetatellError {}
export class RateLimitError extends MetatellError {}
export class UnsupportedAudioFormatError extends MetatellError {}
```

##### **4.4. ユーティリティ**

```typescript
export const pcm = {
  /**
   * 16-bit PCMのサンプルレートを変換します。
   * (内部では品質とパフォーマンスのバランスが良い線形補間を使用します)
   */
  resample(
    input: PcmInput,
    fromHz: number,
    toHz: number,
    channels?: 1 | 2,
  ): AsyncIterable<Int16Array>;

  /**
   * PCMストリームを指定サンプル数ごとのチャンクに分割します。
   */
  chunk(
    input: AsyncIterable<Int16Array>,
    samplesPerChunk: number,
  ): AsyncIterable<Int16Array>;
};
```

-----

#### **5. 詳細仕様**

  * **接続 (`connect`)**: `serverUrl`と`roomId`からWebSocketエンドポイントを解決し、Phoenix Channelに接続します。成功すると`'connected'`イベントが発火します。
  * **エラーハンドリング**: APIは失敗時にそれぞれのエラークラス（`AuthError`など）を`throw`します。これにより、呼び出し側は`catch`ブロックでエラーの種類に応じた処理が可能です。
  * **音声 (`voice.playPcm`)**:
      * 入力されたPCMは、内部で48kHz/monoに正規化されます（ステレオは`(L+R)/2`でミックス）。
      * 10ms（480サンプル）単位のフレームに分割され、LiveKitのオーディオトラックに送信されます。
      * 内部に数秒分のバッファを持ち、供給が早すぎる場合は背圧をかけます。バッファが溢れた場合は`RateLimitError`をスローします。
      * 戻り値の`PlaybackControls.stop()`を呼ぶと、バッファがクリアされ即座に送信が停止します。
  * **チャット (`chat.onMention`)**:
      * ボット自身の名前（`getInfo()`で取得可能）に対する`@名前`の形式を監視します。
      * 大文字/小文字、前後の空白を無視してマッチングします。
      * ハンドラに渡される`text`は、メンション部分が除去された残りの文字列です。

-----

#### **6. 実装例（クイックスタート）**

```typescript
import { createMetatellClient, pcm } from '@metatell/sdk';
import { synthesizeWithExternalTTS } from './my-tts-service'; // 外部TTSサービス

async function main() {
  const client = createMetatellClient({
    serverUrl: 'wss://metatell.app/socket',
    roomId: 'YOUR_ROOM_ID',
    token: 'YOUR_AUTH_TOKEN',
    logger: 'debug',
  });

  client.on('error', (err) => console.error('SDK Error:', err));
  client.on('user-join', (user) => console.log(`${user.name} joined!`));

  client.chat.onMention(async ({ from, text, reply }) => {
    console.log(`Mention from ${from.name}: ${text}`);

    if (text.includes('こんにちは')) {
      await reply('こんにちは！'); // 簡易返信

      // TTSで音声を生成し、再生 (例: TTSは24kHzでPCMを返す)
      const pcm24k = await synthesizeWithExternalTTS('音声で失礼します。');
      
      // SDKユーティリティで48kHzにリサンプリング
      const pcm48kStream = pcm.resample(pcm24k, 24000, 48000);

      // 再生
      const playback = await client.voice.playPcm(pcm48kStream, {
        sampleRateHz: 48000,
        channels: 1
      });
      await playback.finished; // 再生完了を待つ
      console.log('Playback finished.');
    }
  });

  try {
    await client.connect();
    console.log('Bot connected successfully!');
  } catch (error) {
    console.error('Failed to connect:', error);
  }
}

main();
```
