/**
 * Prefix match ID resolver
 * Matches based on ID prefix (UUID format assumption)
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'
import type { IdResolutionResult, IUserIdResolver } from './IUserIdResolver.js'

export class PrefixMatchResolver implements IUserIdResolver {
  private readonly name = 'prefix-match'
  private readonly priority = 4
  private readonly minLength: number

  constructor(minLength = 16) {
    this.minLength = minLength
  }

  resolve(
    networkId: string,
    users: ReadonlyArray<PresenceUser>,
    _nafData?: NAFComponent,
  ): IdResolutionResult {
    if (!networkId || networkId.length < this.minLength) {
      return { confidence: 'none' }
    }

    const prefix = networkId.substring(0, this.minLength)
    const user = users.find(
      (u) => u.id && u.id.length >= this.minLength && u.id.substring(0, this.minLength) === prefix,
    )

    if (user) {
      return {
        userId: user.id,
        strategy: this.name,
        confidence: 'medium',
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
