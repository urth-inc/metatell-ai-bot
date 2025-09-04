/**
 * ServiceIdentifier - Type-safe service identification token
 *
 * This abstract class serves as a type token for dependency injection,
 * allowing type-safe service registration and retrieval without strings.
 *
 * Usage:
 * ```typescript
 * export interface IMyService { ... }
 * export abstract class MyService extends ServiceIdentifier<IMyService> {}
 * ```
 * @template T - The interface type this identifier represents
 */
export abstract class ServiceIdentifier<T> {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: This field is used for type inference only
  private readonly _phantom?: T
}

/**
 * Extracts the service interface type from a ServiceIdentifier
 */
export type ServiceType<T> = T extends ServiceIdentifier<infer U> ? U : T

/**
 * ServiceKey - Union type for valid service keys
 * Supports both concrete classes and abstract classes (tokens)
 */
// Type alias for constructor parameters - necessary for generic DI container
// biome-ignore lint/suspicious/noExplicitAny: Constructor parameters must accept any types for DI container flexibility
type ConstructorArgs = any[]

export type ServiceKey<T> =
  | (new (
      ...args: ConstructorArgs
    ) => T) // Concrete class constructor
  | (abstract new (
      ...args: ConstructorArgs
    ) => T) // Abstract class (token)
