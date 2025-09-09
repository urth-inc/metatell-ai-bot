# API リファレンス（抜粋）

SDK は 2 層の API を提供します。

1. 高レベル: `MetatellClient`（シンプルな利用）
2. 低レベル: `AgentClient`（詳細制御や高度な拡張向け）

## `createMetatellClient(options)` → `MetatellClient`

### Options（主な項目）

- `serverUrl: string` — 例: `wss://metatell.app`（パス不要）
- `roomId: string`
- `token?: string` — 認証トークン（要否は運用/環境に依存）
- `username?: string`, `avatarId?: string`
- `debug?: boolean` — 詳細ログを有効化
- `reconnect?: { enabled?: boolean; maxDelayMs?: number }`

### メソッド

- `connect(): Promise<void>`
- `disconnect(): Promise<void>`
- `getInfo(): Promise<{ name; version; roomId; sessionId? }>`
- `getUsers(): User[]` — 同期取得（内部キャッシュの現在値）
- `getSessionId(): string | null`
- `getRateLimit(key): number | undefined` / `setRateLimit(key, perSecond)`

### 名前空間: `room`

- `room.getUsers(): Promise<User[]>`
- `room.getNearbyUsers(radius?: number): Promise<User[]>`

### 名前空間: `chat`

- `chat.send(text: string): Promise<void>`
- `chat.onMessage(handler)` → すべてのメッセージを購読

ハンドラ引数: `{ from: User; text: string; mention?: { sessionId; name }, reply(text) }`

### 名前空間: `avatar`

- `avatar.select(assetId: string): Promise<void>`
- `avatar.moveTo({ x,y,z }): Promise<void>`
- `avatar.rotateTo({ x,y,z }): Promise<void>` — 角度（度数法）
- `avatar.play(animation: { id; url?; name?; loop?; duration?; transitionDuration? }): Promise<void>`
- `avatar.getAvailableAssets(): Promise<AvatarAsset[]>`
- `avatar.getAvailableAnimations(): Promise<Animation[]>`

### 音声（experimental）

- `voice.playPcm(...)` は SDK 側にプレースホルダー実装があります。実動環境では `@metatell/bot-realtime` を併用してください（examples を参照）。

### イベント（`MetatellClientEvents`）

- `connected()` / `disconnected(reason?)`
- `chat-message({ from, text, mention? })`
- `user-join(User)` / `user-leave(User)`

注記: `error(MetatellError)` は型として存在しますが、現状 SDK 内からの発火は限定的です（多くは例外としてスロー）。

### エラー

- `MetatellError`（基底）
- `AuthError`, `NetworkError`, `NotFoundError`, `RateLimitError`, `UnsupportedAudioFormatError`

---

## `AgentClient`（低レベル制御）

### 生成

```ts
import { createAgentClient } from '@metatell/bot-sdk'

const client = createAgentClient({ /* BotConfiguration */ })
```

### 主なメソッド

- 接続/状態: `connect({ url, token, ... })`, `disconnect()`, `join(room)`, `leave()`, `getStatus()`
- メッセージ: `send(text)`
- アバター: `move({x,y,z})`, `look(target|{userId})`, `lookAtNearest()`
- アニメーション: `playAnimation(id|{ id, options })`, `stopAnimation()`, `getAvailableAnimations()`

### イベント（例）

- `connection:established`, `connection:lost`, `connection:error`
- `room:joined`, `room:left`
- `user:joined`, `user:left`, `user:updated`
- `message:received`, `message:sent`
- `avatar:spawned`, `avatar:moved`, `avatar:updated`

---

## 型（抜粋）

- `Vec3`, `Euler`, `User`, `BotInfo`, `AvatarAsset`, `Animation`
- `CreateClientOptions`, `PcmInput`, `PcmInputOptions`, `PlaybackControls`

---

## NAF（同期メッセージ）

`@metatell/bot-core` の型を再エクスポートしており、`NAF.md` に概要を記載しています。型安全なビルダー/型ガードを活用すると、3D 同期メッセージの扱いが楽になります。

