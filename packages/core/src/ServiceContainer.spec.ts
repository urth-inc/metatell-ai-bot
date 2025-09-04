import { beforeEach, describe, expect, it } from 'vitest'
import { ServiceContainer } from './ServiceContainer.js'
import { ServiceIdentifier } from './ServiceIdentifier.js'

describe('ServiceContainer', () => {
  let container: ServiceContainer

  beforeEach(() => {
    container = new ServiceContainer()
  })

  describe('register', () => {
    it('should register a service factory', () => {
      class TestService {
        name = 'test'
      }
      const factory = () => new TestService()
      container.register(TestService, factory)

      expect(container.has(TestService)).toBe(true)
    })

    it('should register a service as singleton by default', () => {
      class CounterService {
        constructor(public id: number) {}
      }

      let callCount = 0
      const factory = () => {
        callCount++
        return new CounterService(callCount)
      }

      container.register(CounterService, factory)

      const instance1 = container.get(CounterService)
      const instance2 = container.get(CounterService)

      expect(instance1).toBe(instance2)
      expect(callCount).toBe(1)
    })

    it('should allow non-singleton services', () => {
      class CounterService {
        constructor(public id: number) {}
      }

      let callCount = 0
      const factory = () => {
        callCount++
        return new CounterService(callCount)
      }

      container.register(CounterService, factory, { singleton: false })

      const instance1 = container.get(CounterService)
      const instance2 = container.get(CounterService)

      expect(instance1).not.toBe(instance2)
      expect(callCount).toBe(2)
    })
  })

  describe('get', () => {
    it('should retrieve a registered service', () => {
      class TestService {
        name = 'test'
      }
      const service = new TestService()
      container.register(TestService, () => service)

      const retrieved = container.get(TestService)
      expect(retrieved).toBe(service)
    })

    it('should throw an error for unregistered service', () => {
      class UnknownService {}
      expect(() => container.get(UnknownService)).toThrow('Service "UnknownService" not registered')
    })

    it('should pass container to factory function', () => {
      class DependencyService {
        value = 42
      }
      class MainService {
        constructor(public dep: DependencyService) {}
      }

      container.register(DependencyService, () => new DependencyService())
      container.register(MainService, (c) => new MainService(c.get(DependencyService)))

      const service = container.get(MainService)
      expect(service.dep.value).toBe(42)
    })
  })

  describe('has', () => {
    it('should return true for registered services', () => {
      class TestService {}
      container.register(TestService, () => new TestService())
      expect(container.has(TestService)).toBe(true)
    })

    it('should return false for unregistered services', () => {
      class UnknownService {}
      expect(container.has(UnknownService)).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear singleton instances', () => {
      class CounterService {
        constructor(public id: number) {}
      }

      let callCount = 0
      const factory = () => {
        callCount++
        return new CounterService(callCount)
      }

      container.register(CounterService, factory)

      container.get(CounterService)
      expect(callCount).toBe(1)

      container.clear()
      container.get(CounterService)
      expect(callCount).toBe(2)
    })
  })

  describe('bind', () => {
    it('should bind class to itself', () => {
      class TestService {
        getName() {
          return 'TestService'
        }
      }

      container.bind(TestService)

      const instance = container.get(TestService)
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getName()).toBe('TestService')
    })
  })

  describe('registerAll', () => {
    it('should register multiple services at once', () => {
      class Service1 {}
      class Service2 {}
      class Service3 {}

      container.registerAll([
        { key: Service1, factory: () => new Service1() },
        { key: Service2, factory: () => new Service2() },
        { key: Service3, factory: () => new Service3() },
      ])

      expect(container.has(Service1)).toBe(true)
      expect(container.has(Service2)).toBe(true)
      expect(container.has(Service3)).toBe(true)
    })
  })

  describe('createScope', () => {
    it('should create a scoped container', () => {
      class SharedService {
        constructor(public id: number) {}
      }

      let id = 0
      container.register(SharedService, () => new SharedService(++id))

      const scoped = container.createScope()

      const instance1 = container.get(SharedService)
      const instance2 = scoped.get(SharedService)

      expect(instance1.id).toBe(1)
      expect(instance2.id).toBe(2)
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('Interface token support', () => {
    // テスト用のインターフェースとトークン
    interface ITestService {
      getValue(): string
    }

    abstract class TestService extends ServiceIdentifier<ITestService> {}

    class TestServiceImpl implements ITestService {
      getValue(): string {
        return 'test-value'
      }
    }

    it('should register and retrieve services using interface tokens', () => {
      container.register(TestService, () => new TestServiceImpl())

      const service = container.get(TestService)
      expect(service.getValue()).toBe('test-value')
    })

    it('should support singleton pattern with interface tokens', () => {
      container.register(TestService, () => new TestServiceImpl())

      const instance1 = container.get(TestService)
      const instance2 = container.get(TestService)

      // Same instance should be returned
      expect(instance1).toBe(instance2)
    })

    it('should throw error for unregistered interface token', () => {
      expect(() => container.get(TestService)).toThrow('Service "TestService" not registered')
    })

    it('should work with both interface tokens and concrete classes', () => {
      class ConcreteService {
        getValue(): string {
          return 'concrete-value'
        }
      }

      container.register(TestService, () => new TestServiceImpl())
      container.register(ConcreteService, () => new ConcreteService())

      const interfaceService = container.get(TestService)
      const concreteService = container.get(ConcreteService)

      expect(interfaceService.getValue()).toBe('test-value')
      expect(concreteService.getValue()).toBe('concrete-value')
    })

    it('should handle dependencies with typed registration', () => {
      interface ILogger {
        log(message: string): void
      }

      abstract class Logger extends ServiceIdentifier<ILogger> {}

      class ConsoleLogger implements ILogger {
        log(_message: string): void {
          // テスト用の実装
        }
      }

      interface IDatabase {
        connect(): void
      }

      abstract class Database extends ServiceIdentifier<IDatabase> {}

      class MockDatabase implements IDatabase {
        connect(): void {
          // テスト用の実装
        }
      }

      class AppService {
        constructor(
          public logger: ILogger,
          public database: IDatabase,
        ) {}
      }

      // 依存関係の登録
      container.register(Logger, () => new ConsoleLogger())
      container.register(Database, () => new MockDatabase())

      // 依存関係を持つサービスの登録
      container.register(AppService, (c) => new AppService(c.get(Logger), c.get(Database)))

      const appService = container.get(AppService)
      expect(appService.logger).toBeInstanceOf(ConsoleLogger)
      expect(appService.database).toBeInstanceOf(MockDatabase)
    })

    it('should check for service registration with tokens', () => {
      container.register(TestService, () => new TestServiceImpl())

      expect(container.has(TestService)).toBe(true)
      expect(container.has(TestServiceImpl)).toBe(false)
    })

    it('should clear services with interface tokens', () => {
      let callCount = 0
      container.register(TestService, () => {
        callCount++
        return new TestServiceImpl()
      })

      container.get(TestService)
      expect(callCount).toBe(1)

      container.clear()
      container.get(TestService)
      expect(callCount).toBe(2)
    })
  })
})
