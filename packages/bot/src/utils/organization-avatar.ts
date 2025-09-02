/**
 * Organization avatar utilities
 *
 * This module provides helper functions for working with SDK's OrganizationService
 * in the bot context. Most functionality has been moved to the SDK.
 */

import type { IOrganizationService, OrganizationAvatar } from '@metatell/sdk'

/**
 * Helper to fetch organization avatars using the SDK service
 *
 * @param organizationService - The organization service from SDK
 * @param hubUrl - Hub URL (e.g., https://metatell-stg.app)
 * @param hubId - Hub ID
 * @returns List of available avatars
 */
export async function fetchOrganizationAvatarsForBot(
  organizationService: IOrganizationService,
  hubUrl: string,
  hubId: string,
): Promise<OrganizationAvatar[]> {
  try {
    // First get organization info from realm endpoint
    const orgInfo = await organizationService.getOrganizationInfo(hubUrl, hubId)

    // Then fetch avatars for that organization
    return await organizationService.fetchOrganizationAvatars(hubUrl, orgInfo.organizationId)
  } catch (error) {
    console.error('Error fetching organization avatars:', error)
    throw error
  }
}

/**
 * Re-export for backward compatibility
 * @deprecated Use SDK's OrganizationService.selectAvatar instead
 */
export function selectAvatar(
  avatars: OrganizationAvatar[],
  config?: {
    avatarId?: string
    preferRandom?: boolean
  },
): string | null {
  // This is kept for backward compatibility but delegates to a simple implementation
  if (!avatars || avatars.length === 0) {
    return null
  }

  if (config?.avatarId) {
    const specified = avatars.find((a) => a.avatar_id === config.avatarId)
    if (specified) {
      return specified.avatar_id
    }
  }

  if (config?.preferRandom) {
    const randomIndex = Math.floor(Math.random() * avatars.length)
    return avatars[randomIndex].avatar_id
  }

  return avatars[0].avatar_id
}
