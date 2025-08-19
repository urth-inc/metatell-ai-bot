# AIボット表示問題の修正指示

## 問題の概要
人間のユーザーがAIアバターの存在するルームに後から入室した場合、AIアバターが描画されない問題が発生しています。AIアバターが先に入室している場合、後から入る人間のユーザーにはAIアバターが表示されません。逆に、人間のユーザーが先に入室していて、後からAIアバターが入室する場合は正常に表示されます。

## 原因
NAF（Networked A-Frame）のアバター同期において、AIボットは新規ユーザーの入室を検知した際に、既存のアバター情報を再送信していないことが原因です。

### 技術的詳細
1. 人間のクライアント（v-air_client）では、再接続時に`hub.js:742`で`sendEnteredEvent()`を呼び出して既存のアバター情報を再同期しています
2. AIボット（metatell-ai-bot）では、`MetatellBot.ts:185-195`の`handleUserJoin`メソッドでウェルカムメッセージの送信のみを行っており、アバターの再同期を行っていません
3. NAFでは新規参加者に対して`isFirstSync: true`フラグを付けたアバターデータを送信する必要があります

## 修正内容

### 1. AvatarController.tsに再同期メソッドを追加

`/Users/akira/ghq/github.com/urth-inc/metatell-ai-bot/src/core/services/AvatarController.ts`に以下のメソッドを追加してください：

```typescript
async resyncAvatar(): Promise<void> {
  if (!this.state || !this.sessionId) {
    throw new Error('Avatar not spawned')
  }

  const timestamp = Date.now()

  // 既存のアバター状態を isFirstSync: true で再送信
  const nafMessage = {
    dataType: 'u',
    data: {
      networkId: this.state.networkId,
      owner: this.sessionId,
      creator: this.sessionId,
      lastOwnerTime: timestamp,
      template: '#remote-avatar',
      persistent: false,
      isFirstSync: true,  // 重要: 新規ユーザーに対して初回同期フラグを設定
      forceRender: false,
      megaphone: false,
      temporaryMegaphone: false,
      parent: null,
      components: {
        '0': { isVector3: true, ...this.state.position },
        '1': { x: 0, y: 0, z: 0 },
        '2': { x: 1, y: 1, z: 1 },
        '3': {
          avatarSrc: this.state.avatarSrc,
          avatarType: 'skinnable',
          muted: false,
          isSharingAvatarCamera: false,
        },
        '4': { x: 0, y: 0, z: 0, w: 1 },
        '5': { x: 0, y: 0, z: 0, w: 1 },
        '6': { x: 0, y: 0, z: 0, w: 1 },
        '7': { x: 0, y: 0, z: 0 },
        '8': { x: 0, y: 0, z: 0 },
        '9': false,
        '10': { x: 0, y: 0, z: 0 },
        '11': { x: 1, y: 1, z: 1 },
        '12': false,
        '13': null,
        '14': { x: 0, y: 0, z: 0 },
      },
    },
  }
  
  await this.messageService.sendNAF(nafMessage)
  
  logger.debug(`✅ Avatar resynced for new user`)
}
```

### 2. IAvatarController.tsインターフェースにメソッドを追加

`/Users/akira/ghq/github.com/urth-inc/metatell-ai-bot/src/core/interfaces/IAvatarController.ts`に以下のメソッド定義を追加してください：

```typescript
/**
 * Resync avatar state for newly joined users
 * Sends the complete avatar state with isFirstSync flag
 */
resyncAvatar(): Promise<void>
```

### 3. MetatellBot.tsのhandleUserJoinメソッドを修正

`/Users/akira/ghq/github.com/urth-inc/metatell-ai-bot/src/bots/MetatellBot.ts`の`handleUserJoin`メソッドを以下のように修正してください：

```typescript
private async handleUserJoin(user: PresenceUser): Promise<void> {
  const config = this.configProvider.getConfiguration()
  const displayName = user.profile.displayName || 'Unknown'

  // 自分自身のjoinイベントは無視
  if (displayName !== config.profile.displayName) {
    // Welcome new users
    this.messageService.sendMessage(`Welcome to the room, ${displayName}! 👋`).catch((error) => {
      this.logger.debug('Welcome message error:', { error })
    })

    // 重要: 新規ユーザーに対して既存のアバター情報を再送信
    const currentState = this.avatarController.getState()
    if (currentState) {
      // 少し遅延を入れて、新規ユーザーの初期化が完了するのを待つ
      setTimeout(async () => {
        try {
          await this.avatarController.resyncAvatar()
          this.logger.debug(`Resynced avatar for new user: ${displayName}`)
        } catch (error) {
          this.logger.error('Failed to resync avatar:', error)
        }
      }, 1000) // 1秒の遅延
    }
  }
}
```

## 動作確認方法

1. AIボットを起動してルームに入室させる
2. その後、別のブラウザ/クライアントから人間のユーザーとして同じルームに入室
3. AIアバターが正しく表示されることを確認
4. AIアバターの位置更新（移動コマンド等）が正常に反映されることを確認

## 注意事項

- `isFirstSync: true`フラグは新規ユーザーに対してアバターの完全な初期状態を送信するために必須です
- 遅延（setTimeout）は新規ユーザーのNAF接続が確立されるのを待つために必要です
- この修正により、AIボットは人間のクライアントと同様の再同期動作を行うようになります