/**
 * Composite resolver that chains multiple resolvers
 * Implements the Chain of Responsibility pattern
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'
import type {
  ICompositeUserIdResolver,
  IdResolutionResult,
  IUserIdResolver,
} from './IUserIdResolver.js'

export class CompositeUserIdResolver implements ICompositeUserIdResolver {
  private readonly resolvers: Map<string, IUserIdResolver> = new Map()
  private sortedResolvers: IUserIdResolver[] = []

  constructor(resolvers: IUserIdResolver[] = []) {
    for (const resolver of resolvers) {
      this.addResolver(resolver)
    }
  }

  addResolver(resolver: IUserIdResolver): void {
    this.resolvers.set(resolver.getName(), resolver)
    this.updateSortedResolvers()
  }

  removeResolver(name: string): void {
    this.resolvers.delete(name)
    this.updateSortedResolvers()
  }

  getResolvers(): ReadonlyArray<IUserIdResolver> {
    return [...this.sortedResolvers]
  }

  resolve(
    networkId: string,
    users: ReadonlyArray<PresenceUser>,
    nafData?: NAFComponent,
  ): IdResolutionResult {
    for (const resolver of this.sortedResolvers) {
      const result = resolver.resolve(networkId, users, nafData)

      // Return first successful resolution
      if (result.userId && result.confidence !== 'none') {
        return result
      }
    }

    return {
      confidence: 'none',
    }
  }

  getName(): string {
    return 'composite'
  }

  getPriority(): number {
    return 0 // Highest priority as the main resolver
  }

  private updateSortedResolvers(): void {
    this.sortedResolvers = Array.from(this.resolvers.values()).sort(
      (a, b) => a.getPriority() - b.getPriority(),
    )
  }
}
