import type { ServiceKey, ServiceType } from './ServiceIdentifier.js'

export type { ServiceKey } from './ServiceIdentifier.js'

type ServiceFactory<T> = (container: ServiceContainer) => T
type ServiceInstance = unknown

/**
 * Service registration options
 */
interface ServiceOptions {
  singleton?: boolean
  // Future extensibility
  eager?: boolean
  dispose?: () => void
}

/**
 * Service registration configuration
 */
interface ServiceRegistration {
  key: ServiceKey<unknown>
  factory: ServiceFactory<unknown>
  options?: ServiceOptions
}

/**
 * Type-safe Service Container for Dependency Injection
 *
 * Features:
 * - Full type safety with TypeScript - no string-based APIs
 * - Automatic type inference using ServiceIdentifier tokens
 * - Support for both interface tokens and concrete classes
 * - Singleton and transient lifetime management
 * - Compile-time type checking for all service registrations and retrievals
 */
export class ServiceContainer {
  private readonly services = new Map<ServiceKey<unknown>, ServiceInstance>()
  private readonly factories = new Map<ServiceKey<unknown>, ServiceFactory<unknown>>()
  private readonly options = new Map<ServiceKey<unknown>, ServiceOptions>()

  /**
   * Register a service with the container using type-safe keys
   * @param key Service identifier (interface token or class) - strings are not supported
   * @param factory Factory function to create the service
   * @param options Service registration options
   * @example
   * container.register(MessageService, () => new MessageServiceImpl())
   * container.register(AppSettings, () => new AppSettingsImpl())
   */
  register<T>(
    key: ServiceKey<T>,
    factory: ServiceFactory<ServiceType<T>>,
    options: ServiceOptions = {},
  ): this {
    this.factories.set(key as ServiceKey<unknown>, factory as ServiceFactory<unknown>)
    this.options.set(key as ServiceKey<unknown>, { singleton: true, ...options })
    return this // Fluent API
  }

  /**
   * Get a service from the container with automatic type inference
   * @param key Service identifier (interface token or class) - strings are not supported
   * @returns Service instance with correct type inferred from the key
   * @throws Error if service is not registered
   * @example
   * const messageService = container.get(MessageService) // Type is inferred as IMessageService
   * const appSettings = container.get(AppSettings) // Type is inferred as IAppSettings
   */
  get<T>(key: ServiceKey<T>): ServiceType<T> {
    const options = this.options.get(key as ServiceKey<unknown>)

    // Check for singleton instance
    if (options?.singleton && this.services.has(key as ServiceKey<unknown>)) {
      return this.services.get(key as ServiceKey<unknown>) as ServiceType<T>
    }

    // Get factory
    const factory = this.factories.get(key as ServiceKey<unknown>)
    if (!factory) {
      const keyName = this.getServiceName(key as ServiceKey<unknown>)
      throw new Error(`Service "${keyName}" not registered`)
    }

    // Create instance
    const instance = factory(this)

    // Store singleton
    if (options?.singleton) {
      this.services.set(key as ServiceKey<unknown>, instance)
    }

    return instance as ServiceType<T>
  }

  /**
   * Check if a service is registered
   * @param key Service identifier
   * @returns true if the service is registered
   */
  has<T>(key: ServiceKey<T>): boolean {
    return this.factories.has(key as ServiceKey<unknown>)
  }

  /**
   * Clear all singleton instances
   * Useful for testing or resetting the container
   */
  clear(): void {
    // Call dispose handlers if available
    for (const [key, options] of this.options) {
      if (options.dispose && this.services.has(key as ServiceKey<unknown>)) {
        options.dispose()
      }
    }
    this.services.clear()
  }

  /**
   * Bind a class to itself (syntactic sugar)
   * @param implementation Class constructor
   * @param options Service options
   */
  bind<T>(implementation: new (...args: unknown[]) => T, options?: ServiceOptions): this {
    // For concrete classes, T = ServiceType<T>, so we can bypass type checking
    this.factories.set(implementation as ServiceKey<unknown>, () => new implementation())
    this.options.set(implementation as ServiceKey<unknown>, { singleton: true, ...options })
    return this
  }

  /**
   * Register all services at once (bulk registration)
   * @param registrations Array of service registrations
   */
  registerAll(registrations: ServiceRegistration[]): this {
    for (const reg of registrations) {
      this.register(reg.key, reg.factory, reg.options)
    }
    return this
  }

  /**
   * Create a scoped container (child container)
   * Useful for request-scoped services
   */
  createScope(): ServiceContainer {
    const scoped = new ServiceContainer()
    // Copy factories but not singleton instances
    for (const [key, factory] of this.factories) {
      scoped.factories.set(key, factory)
      const options = this.options.get(key)
      if (options) {
        scoped.options.set(key, options)
      }
    }
    return scoped
  }

  /**
   * Get service name for error messages
   */
  private getServiceName(key: ServiceKey<unknown>): string {
    if (typeof key === 'function') {
      return key.name || 'AnonymousService'
    }
    return 'UnknownService'
  }
}
