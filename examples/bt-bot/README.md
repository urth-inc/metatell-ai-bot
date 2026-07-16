# bt-bot: ビヘイビアツリーで自律行動するボット

ビヘイビアツリー（BT）とLLMで、自分で考えて動き続けるボットを作るテンプレートです。

- **体**: `@metatell/bot-sdk`（歩く、見る、チャットと音声で話す、踊る）
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
# .envに認証トークン、LLMキー、Google Cloud認証情報を設定する
```

音声認識と音声発話には、Speech-to-Text APIとText-to-Speech APIを有効にした
Google Cloudサービスアカウントが必要です。
`.env`の`GOOGLE_APPLICATION_CREDENTIALS`へJSON鍵のパスを設定してください。
標準の`metatell.app`以外の環境では、その環境に対応する
`METATELL_REALTIME_URL`（LiveKit URL）も設定します。認証情報が未設定、または音声の
初期化に失敗した場合も、ボットはチャットのみで動作を続けます。

## 起動

```bash
pnpm dev -- https://metatell.app/YOUR_ROOM_ID
```

ルームURLは`.env`の`METATELL_ROOM_URL`でも指定できます。
起動するとコンソールに、いま実行中のツリーの経路が色つきで表示されます
（黄=RUNNING、緑=SUCCESS、灰=FAILURE）。
`say`、`llm_say`、`llm_reply`などの発言はチャットへ表示され、同じ内容がルーム内で
音声再生されます。音声は前の発言が終わってから順番に再生されるため、重なりません。
発話ノードは音声再生が終わるまで`RUNNING`となり、その間は立ち止まります。
チャットメンションや認識音声への返信では、話しかけたアバターの方を向いて発話します。

ルーム内の人の発話はSpeech-to-Textで認識され、直近の会話としてBTから参照できます。
認識された発話は、チャットのメンションと同じ`mentioned` / `llm_reply`経路へ入り、
チャットと音声で返事をします。ほかのボット、自分自身、在室確認前の参加者の音声は
Google Cloudへ送りません。音声認識された`/killall`では停止せず、キルスイッチは
従来どおり認可済み運営のチャットだけを受け付けます。

## 編集するファイル（3段階）

| 段階 | 編集対象 | やること |
|---|---|---|
| 初級 | `.env`と`my-bot/bot.config.json` | 名前、挨拶、巡回地点、アニメーション割り当てを書き換える |
| 中級 | `my-bot/tree.json`と`my-bot/persona.md` | 行動の分岐を設計する。LLMノードのキャラを作り込む |
| 上級 | `my-bot/custom-nodes.ts` | registerAction / registerConditionで独自ノードを作る |

`src/`はエンジン本体（保護領域）です。読むのは自由ですが、編集はしないでください。
壊れたときは`my-bot/`を初期状態に戻せば復活します。

## tree.jsonの書き方

```json
{
  "root": {
    "type": "priority_selector",
    "children": [
      { "type": "sequence", "children": [
        { "type": "condition", "name": "mentioned" },
        { "type": "action", "name": "llm_reply" } ] },
      { "type": "action", "name": "patrol_next" }
    ]
  }
}
```

- **selector**: 子を上から試し、RUNNINGになった子を完了まで続ける。
- **priority_selector**: RUNNING中も上位の子を再評価する。メンションなど、割り込ませたい分岐に使う。
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
| mentioned | - | ボット宛てのチャットメンションまたは認識音声が届いている |
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
| say | text | チャットと音声で発言する。`{userName}` `{botName}` `{greeting}`が使える |
| greet_user | repeatText, animation | 対象を向いて演出し、初対面は`greeting`、2回目以降は`repeatText`で挨拶する |
| move_to | x, y, z | 指定座標へ歩く（到着でSUCCESS） |
| patrol_next | - | bot.config.jsonの巡回地点を1つ進む |
| move_to_user | - | いちばん近くの人のそばへ歩く |
| look_at_user | - | いちばん近くの人の方を向く |
| emote | animation | アニメーション再生。emotesの別名か、起動時ログに出るID/名前を指定 |
| wait | sec | 指定秒数待つ |
| set_blackboard | key, value | blackboardに値を書く |
| report_users | - | ルームにいる人の名前をチャットと音声で発言する |

標準ツリーの挨拶は、発言に成功したユーザーのセッションIDを起動中のblackboardへ記憶します。
同じユーザーへの2回目以降の挨拶は`greet_user`の`repeatText`へ切り替わります。
挨拶の30秒クールダウンは、演出と発言が成功した時点から始まります。
記憶は最大1,000人分で、上限を超えると古い記録から削除されます。
再接続でセッションIDが変わった場合やボットを再起動した場合は、初対面として扱います。

LLMノード（`"type": "action"`）:

| name | params | 意味 |
|---|---|---|
| llm_reply | - | チャットメンションまたは認識音声にペルソナで返事する |
| llm_say | topic | 状況を見て自発的にひとこと話す。必ずcooldownの中に置く |
| llm_choose | choices, key, question | 選択肢から選ばせ、blackboardに書く |

### アニメーションの割り当て

使えるアニメーションはアバターごとに違います。起動すると
「利用可能なアニメーション: ...」がログに出るので、そのIDを
`bot.config.json`の`emotes`に割り当ててください。

```json
"emotes": {
  "greet": "＜挨拶に使うアニメーションのID＞",
  "dance": "＜ダンスに使うアニメーションのID＞"
}
```

ツリーからは`emote`の`animation`に別名（`greet`など）を書きます。
未割り当ての別名はその回だけスキップされ、ボットは止まりません。
`idle`と`walking`はどのアバターでも使えます（歩行時は自動で切り替わります）。

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

- チャット・音声発言の最小間隔は5秒。自発的な連投は抑制し、メンション返信は間隔を待って送る。
- ほかのボットの発言は知覚しない（ボット同士の無限ループ防止）。
- 移動座標はルーム境界内にクランプ、移動速度は秒速2mまで。
- `OPERATOR_SESSION_IDS`で指定した運営が`/killall`とチャットすると即時に停止する。
  未設定ならリモート停止は無効になる。
- 自作ノードの例外はFAILUREになるだけで、ボットは落ちない。

`priority_selector`で非同期の自作アクションが割り込まれた場合、`ctx.signal.aborted`が
`true`になります。`await`の後で確認し、発言などの副作用を続けず`FAILURE`を返してください。

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
