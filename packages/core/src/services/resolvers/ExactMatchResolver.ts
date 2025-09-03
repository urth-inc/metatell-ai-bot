/**
 * Exact match ID resolver
 * Highest confidence resolution strategy
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'
import type { IdResolutionResult, IUserIdResolver } from './IUserIdResolver.js'

export class ExactMatchResolver implements IUserIdResolver {
  private readonly name = 'exact-match'
  private readonly priority = 1

  resolve(
    networkId: string,
    users: ReadonlyArray<PresenceUser>,
    _nafData?: NAFComponent,
  ): IdResolutionResult {
    const user = users.find((u) => u.id === networkId)

    if (user) {
      return {
        userId: user.id,
        strategy: this.name,
        confidence: 'exact',
      }
    }

    return {
      confidence: 'none',
    }
  }

  getName(): string {
    return this.name
  }

  getPriority(): number {
    return this.priority
  }
}
