import { ServiceIdentifier } from '../ServiceIdentifier.js'

/**
 * Organization information from realm endpoint
 */
export interface OrganizationInfo {
  organizationId: string // result.id from realm endpoint
  realmId: string // result.realm from realm endpoint
}

/**
 * Organization avatar
 */
export interface OrganizationAvatar {
  id: string // changed from avatar_id for consistency with API
  name: string
  gltf: {
    avatar: string // URL
  }
  thumbnail_url?: string
  description?: string
  preview_url?: string
}

/**
 * Organization service interface
 */
export interface IOrganizationService {
  /**
   * Get organization info from hub ID
   */
  getOrganizationInfo(hubUrl: string, hubId: string): Promise<OrganizationInfo>

  /**
   * Fetch organization avatars
   */
  fetchOrganizationAvatars(hubUrl: string, organizationId: string): Promise<OrganizationAvatar[]>

  /**
   * Select avatar based on configuration
   * Returns the selected avatar or null if no avatars available
   */
  selectAvatar(
    avatars: OrganizationAvatar[],
    options?: {
      avatarId?: string
      avatarSelection?: 'random' | 'organization' | string
    },
  ): OrganizationAvatar | null
}

// Service identifier token for dependency injection
export abstract class OrganizationService extends ServiceIdentifier<IOrganizationService> {}
