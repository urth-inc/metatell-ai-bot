# bt-bot: ビヘイビアツリーで自律行動するボット

ビヘイビアツリー（BT）とLLMで、自分で考えて動き続けるボットを作るテンプレートです。

- **体**: `@metatell/bot-sdk`（歩く、見る、話す、踊る）
- **神経系**: ビヘイビアツリー（「今なにをすべきか」を優先順位つきで決め続ける）
- **頭脳**: LLM（セリフの生成と、分岐の意思決定）

LLMが手足を直接動かすのではなく、検証済みのエンジンが構造化されたツリーを実行します。

## セットアップ

この例はリポジトリ内の最新SDKを使うpnpm workspaceです。リポジトリのルートから
依存関係をインストールしてから、例のディレクトリへ移動してください。

```bash
pnpm install
cd examples/bt-bot
cp .env.example .env
# .envに認証トークンとLLMキーを貼る
```

## 起動

```bash
pnpm dev -- https://metatell.app/YOUR_ROOM_ID
```

ルームURLは`.env`の`METATELL_ROOM_URL`でも指定できます。
起動するとコンソールに、いま実行中のツリーの経路が色つきで表示されます
（黄=RUNNING、緑=SUCCESS、灰=FAILURE）。

## 編集するファイル（3段階）

| 段階 | 編集対象 | やること |
|---|---|---|
| 初級 | `.env`と`my-bot/bot.config.json` | 名前、挨拶、巡回地点を自分のものに書き換える |
| 中級 | `my-bot/tree.json`と`my-bot/persona.md` | 行動の分岐を設計する。LLMノードのキャラを作り込む |
| 上級 | `my-bot/custom-nodes.ts` | registerAction / registerConditionで独自ノードを作る |

`src/`はエンジン本体（保護領域）です。読むのは自由ですが、編集はしないでください。
壊れたときは`my-bot/`を初期状態に戻せば復活します。

## tree.jsonの書き方

```json
{
  "root": {
    "type": "selector",
    "children": [
      { "type": "sequence", "children": [
        { "type": "condition", "name": "mentioned" },
        { "type": "action", "name": "llm_reply" } ] },
      { "type": "action", "name": "patrol_next" }
    ]
  }
}
```

- **selector**: 子を上から試して、最初に成功したものを採用する（優先順位）。
- **sequence**: 子を順番に全部実行する。途中で失敗したら止まる。
- **inverter / cooldown / repeat**: 子を1つ持つ飾りノード。cooldownは「前回成功から`sec`秒間は実行しない」。
- **condition / action**: `name`で組み込みノードか自作ノードを指定する。

書き換えたら次で検証できます。エラーは行番号つきの日本語で出ます。

```bash
pnpm check
```

ボットの起動中に`my-bot/tree.json`を保存すると、検証を通過した場合だけ自動で再読み込みされます。

## 組み込みノード

条件（`"type": "condition"`）:

| name | params | 意味 |
|---|---|---|
| mentioned | - | ボット宛てのメンションが届いている |
| user_nearby | range | 指定距離（m）以内にユーザーがいる |
| is_alone | - | 自分以外に誰もいない |
| anyone_in_room | - | 自分以外に誰かいる |
| user_count | min | ユーザー数がmin以上 |
| chat_contains | word | 直近15秒のチャットに語句が含まれる |
| cooldown | sec, key | 前回成功からsec秒経っていれば成功し、時計をリセット |
| random_chance | p | 確率p（0から1）で成功 |
| blackboard_equals | key, value | blackboardの値が一致する |
| time_elapsed | sec | 起動からsec秒経過している |

行動（`"type": "action"`）:

| name | params | 意味 |
|---|---|---|
| say | text | 発言する。`{userName}` `{botName}` `{greeting}`が使える |
| move_to | x, y, z | 指定座標へ歩く（到着でSUCCESS） |
| patrol_next | - | bot.config.jsonの巡回地点を1つ進む |
| move_to_user | - | いちばん近くの人のそばへ歩く |
| look_at_user | - | いちばん近くの人の方を向く |
| emote | animation | アニメーション再生（wave, dance, nod, jumping, crouchなど） |
| wait | sec | 指定秒数待つ |
| set_blackboard | key, value | blackboardに値を書く |
| report_users | - | ルームにいる人の名前を発言する |

LLMノード（`"type": "action"`）:

| name | params | 意味 |
|---|---|---|
| llm_reply | - | メンションにペルソナで返事する |
| llm_say | topic | 状況を見て自発的にひとこと話す。必ずcooldownの中に置く |
| llm_choose | choices, key, question | 選択肢から選ばせ、blackboardに書く |

## レシピ集

`trees/samples/`に完動するツリーが5本あります。
`my-bot/tree.json`にコピーして、自分のボットに改造してください。

| ファイル | キャラ |
|---|---|
| guide.json | 案内係。来た人に挨拶して展示コーナーへ先導する |
| quiz.json | クイズ屋。近づいた人にランダムなクイズを出す |
| lonely.json | かまってちゃん。ひとりの時間が続くと人を探しに行く |
| dance.json | ダンス営業。人が3人集まると踊り出す |
| moody.json | 気分屋。llm_chooseで機嫌が変わり行動も変わる |

## 日本語からツリーを生成する（/design）

```bash
pnpm design -- "近づいてきた人にクイズを出して、正解したら踊って"
```

LLMがtree.jsonを生成し、検証を通過したものだけを保存します（元のツリーは
`my-bot/tree.backup.json`に退避）。生成は手元のコマンドで、実行はエンジンが行う、
という「計画と実行の分離」がこのテンプレートの設計思想です。

## 安全装置（設定では外せません）

- 発言の最小間隔は5秒。連投は自動で抑制される。
- ほかのボットの発言は知覚しない（ボット同士の無限ループ防止）。
- 移動座標はルーム境界内にクランプ、移動速度は秒速2mまで。
- `OPERATOR_SESSION_IDS`で指定した運営が`/killall`とチャットすると即時に停止する。
  未設定ならリモート停止は無効になる。
- 自作ノードの例外はFAILUREになるだけで、ボットは落ちない。

`OPERATOR_SESSION_IDS`には恒久的なアカウントIDではなく、現在の接続session IDを
カンマ区切りで設定します。まず未設定のまま運営が`/killall`を送り、ボットのログに
表示される`session ID`を`.env`へコピーして再起動してください。運営が再接続すると
同じIDが復元される場合もありますが、ページの再読み込み・再入室・別端末への切り替え
などでは変わり得ます。IDが変わったら設定を更新してボットを再起動してください。
SDKを使う運営クライアントでは`client.getSessionId()`でも現在値を取得できます。

`UNSAFE_MODE=1`はLLMガードを外す実験用フラグです（プロンプトインジェクションへの
耐性を試すときに使います）。普段は使いません。

## 開発者向け

```bash
pnpm test       # エンジンのユニットテスト
pnpm typecheck  # 型チェック
```
