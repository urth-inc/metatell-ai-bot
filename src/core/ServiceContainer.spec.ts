import { beforeEach, describe, expect, it } from 'vitest'
import { ServiceContainer } from './ServiceContainer.js'

describe('ServiceContainer', () => {
  let container: ServiceContainer

  beforeEach(() => {
    container = new ServiceContainer()
  })

  describe('register', () => {
    it('should register a service factory', () => {
      const factory = () => ({ name: 'test' })
      container.register('test', factory)

      expect(container.has('test')).toBe(true)
    })

    it('should register a service as singleton by default', () => {
      let callCount = 0
      const factory = () => {
        callCount++
        return { id: callCount }
      }

      container.register('counter', factory)

      const instance1 = container.get('counter')
      const instance2 = container.get('counter')

      expect(instance1).toBe(instance2)
      expect(callCount).toBe(1)
    })

    it('should allow non-singleton services', () => {
      let callCount = 0
      const factory = () => {
        callCount++
        return { id: callCount }
      }

      container.register('counter', factory, { singleton: false })

      const instance1 = container.get('counter')
      const instance2 = container.get('counter')

      expect(instance1).not.toBe(instance2)
      expect(callCount).toBe(2)
    })
  })

  describe('get', () => {
    it('should retrieve a registered service', () => {
      const service = { name: 'test' }
      container.register('test', () => service)

      const retrieved = container.get('test')
      expect(retrieved).toBe(service)
    })

    it('should throw an error for unregistered service', () => {
      expect(() => container.get('unknown')).toThrow('Service "unknown" not registered')
    })

    it('should pass container to factory function', () => {
      container.register('dep', () => ({ value: 42 }))
      container.register('service', (c) => ({
        dep: c.get('dep'),
      }))

      const service = container.get<{ dep: { value: number } }>('service')
      expect(service.dep.value).toBe(42)
    })
  })

  describe('has', () => {
    it('should return true for registered services', () => {
      container.register('test', () => ({}))
      expect(container.has('test')).toBe(true)
    })

    it('should return false for unregistered services', () => {
      expect(container.has('unknown')).toBe(false)
    })
  })

  describe('clear', () => {
    it('should clear singleton instances', () => {
      let callCount = 0
      const factory = () => {
        callCount++
        return { id: callCount }
      }

      container.register('counter', factory)

      container.get('counter')
      expect(callCount).toBe(1)

      container.clear()
      container.get('counter')
      expect(callCount).toBe(2)
    })
  })

  describe('bind', () => {
    it('should bind interface to implementation', () => {
      class TestService {
        getName() {
          return 'TestService'
        }
      }

      container.bind('ITestService', TestService)

      const instance = container.get<TestService>('ITestService')
      expect(instance).toBeInstanceOf(TestService)
      expect(instance.getName()).toBe('TestService')
    })
  })

  describe('bindWithDependencies', () => {
    it('should bind with resolved dependencies', () => {
      class Logger {
        log(message: string) {
          return `[LOG] ${message}`
        }
      }

      class Database {
        name = 'TestDB'
      }

      class Service {
        constructor(
          public logger: Logger,
          public db: Database,
        ) {}
      }

      container.bind('Logger', Logger)
      container.bind('Database', Database)
      container.bindWithDependencies('Service', Service, ['Logger', 'Database'])

      const service = container.get<Service>('Service')
      expect(service.logger).toBeInstanceOf(Logger)
      expect(service.db).toBeInstanceOf(Database)
      expect(service.logger.log('test')).toBe('[LOG] test')
      expect(service.db.name).toBe('TestDB')
    })

    it('should throw error if dependency is not registered', () => {
      class Service {
        constructor(public dep: unknown) {}
      }

      container.bindWithDependencies('Service', Service, ['UnknownDep'])

      expect(() => container.get('Service')).toThrow('Service "UnknownDep" not registered')
    })
  })
})
