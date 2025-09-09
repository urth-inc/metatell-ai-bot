# よくある質問（FAQ）

- どのランタイムで動きますか？: Node.js 20 以上（LTS 推奨: 22+）。Deno/Bun は未検証。
- ブラウザで使えますか？: 直接のサポートは想定していません（CORS/認証要件に依存）。
- 3D 同期（NAF）はどこを見れば良い？: `docs/NAF.md` と `@metatell/bot-core` の型定義。
- 低レベル API は？: `AgentClient` を利用してください（詳細は `api.md`）。
