/**
 * Interface for user ID resolution strategies
 * This separates the concern of ID resolution from avatar management
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'

/**
 * Result of ID resolution attempt
 */
export interface IdResolutionResult {
  userId?: string
  strategy?: string
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'none'
}

/**
 * Interface for user ID resolvers
 */
export interface IUserIdResolver {
  /**
   * Resolve a network ID to a user ID
   * @param networkId The network ID to resolve
   * @param users Available users to match against
   * @param nafData Optional NAF component data for additional context
   * @returns Resolution result with confidence level
   */
  resolve(
    networkId: string,
    users: ReadonlyArray<PresenceUser>,
    nafData?: NAFComponent,
  ): IdResolutionResult

  /**
   * Get resolver name for debugging/metrics
   */
  getName(): string

  /**
   * Get resolver priority (lower number = higher priority)
   */
  getPriority(): number
}

/**
 * Composite resolver that chains multiple resolvers
 */
export interface ICompositeUserIdResolver extends IUserIdResolver {
  /**
   * Add a resolver to the chain
   */
  addResolver(resolver: IUserIdResolver): void

  /**
   * Remove a resolver from the chain
   */
  removeResolver(name: string): void

  /**
   * Get all registered resolvers
   */
  getResolvers(): ReadonlyArray<IUserIdResolver>
}
