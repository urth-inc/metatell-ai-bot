import { ServiceContainer, ServiceIdentifier } from './packages/core/src/index.js'

// インターフェース定義
interface ITestService {
  doSomething(): void
}

// ServiceIdentifierを使用
abstract class TestService extends ServiceIdentifier<ITestService> {}

// 実装
class TestServiceImpl implements ITestService {
  doSomething(): void {
    console.log('doing something')
  }
}

// コンテナーの使用
const container = new ServiceContainer()
container.register(TestService, () => new TestServiceImpl())

// 型推論のテスト - service は ITestService 型になるはず
const service = container.get(TestService)

// 型チェックコメント
// service: ITestService と推論されるべき
service.doSomething() // このメソッドが自動補完されるはず
