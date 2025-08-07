type ServiceFactory<T> = (container: ServiceContainer) => T
type ServiceInstance = unknown

export class ServiceContainer {
  private services = new Map<string, ServiceInstance>()
  private factories = new Map<string, ServiceFactory<unknown>>()
  private singletons = new Map<string, boolean>()

  register<T>(name: string, factory: ServiceFactory<T>, options?: { singleton?: boolean }): void {
    this.factories.set(name, factory)
    this.singletons.set(name, options?.singleton ?? true)
  }

  get<T>(name: string): T {
    // Check if singleton instance exists
    if (this.singletons.get(name) && this.services.has(name)) {
      return this.services.get(name) as T
    }

    // Get factory
    const factory = this.factories.get(name)
    if (!factory) {
      throw new Error(`Service "${name}" not registered`)
    }

    // Create instance
    const instance = factory(this)

    // Store singleton
    if (this.singletons.get(name)) {
      this.services.set(name, instance)
    }

    return instance as T
  }

  has(name: string): boolean {
    return this.factories.has(name)
  }

  clear(): void {
    this.services.clear()
  }

  // Helper method for binding interfaces to implementations
  bind<T>(interfaceName: string, implementation: new (...args: unknown[]) => T): void {
    this.register(interfaceName, () => new implementation())
  }

  // Helper method for binding with dependencies
  bindWithDependencies<T>(
    interfaceName: string,
    implementation: new (...args: unknown[]) => T,
    dependencies: string[],
  ): void {
    this.register(interfaceName, (container) => {
      const resolvedDeps = dependencies.map((dep) => container.get(dep))
      return new implementation(...resolvedDeps)
    })
  }
}
