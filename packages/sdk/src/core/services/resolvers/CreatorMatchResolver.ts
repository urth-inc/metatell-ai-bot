/**
 * Creator match ID resolver
 * Matches based on NAF component creator field
 */

import type { PresenceUser } from '../../interfaces/IPresenceManager.js'
import type { NAFComponent } from '../../types/index.js'
import type { IdResolutionResult, IUserIdResolver } from './IUserIdResolver.js'

export class CreatorMatchResolver implements IUserIdResolver {
  private readonly name = 'creator-match'
  private readonly priority = 2

  resolve(
    _networkId: string,
    users: ReadonlyArray<PresenceUser>,
    nafData?: NAFComponent,
  ): IdResolutionResult {
    if (!nafData?.creator) {
      return { confidence: 'none' }
    }

    const user = users.find((u) => u.id === nafData.creator)

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
