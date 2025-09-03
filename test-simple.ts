import { AvatarController, type CoreServiceFactory } from './packages/core/src/index.js'

// factoryの型をチェック
const factory = {} as CoreServiceFactory

// getServiceの戻り値の型を見る
const avatar = factory.getService(AvatarController)

// avatar が IAvatarController 型になっているか確認
// TypeScriptの型表示で確認する
export type AvatarType = typeof avatar
