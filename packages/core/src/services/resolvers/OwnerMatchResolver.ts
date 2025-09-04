/**
 * Owner match ID resolver
 * Matches based on NAF component owner field
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'
import type { IdResolutionResult, IUserIdResolver } from './IUserIdResolver.js'

export class OwnerMatchResolver implements IUserIdResolver {
  private readonly name = 'owner-match'
  private readonly priority = 3

  resolve(
    _networkId: string,
    users: ReadonlyArray<PresenceUser>,
    nafData?: NAFComponent,
  ): IdResolutionResult {
    if (!nafData?.owner) {
      return { confidence: 'none' }
    }

    const user = users.find((u) => u.id === nafData.owner)

    if (user) {
      return {
        userId: user.id,
        strategy: this.name,
        confidence: 'high',
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
