import type {
  IOrganizationService,
  OrganizationAvatar,
  OrganizationInfo,
} from '../interfaces/IOrganizationService.js'
import { getLogger } from '../logging/index.js'

interface RoomConfigResponse {
  status: string
  result: {
    roomOrganization?: {
      organization_id: string
    }
  }
}

interface OrganizationAvatarsResponse {
  status: string
  result: Array<{
    id: string
    name: string
    url: string
    type: string
    allow_remixing: boolean
    attributions: { creator: string }
    description: string | null
    gltf: {
      avatar: string
      base: string
    }
    images: {
      preview: {
        url: string
        height: number
        width: number
      }
    }
  }>
}

/**
 * Resolve the admin workers API path based on the hostname.
 *
 * Production : /api/admin/prod
 * Staging    : /api/admin/stg
 * Development: /api/admin/dev
 */
function resolveWorkersBasePath(hostname: string): string {
  if (hostname.includes('-stg.')) return '/api/admin/stg'
  if (hostname.includes('-dev.')) return '/api/admin/dev'
  return '/api/admin/prod'
}

export class OrganizationService implements IOrganizationService {
  private logger = getLogger('OrganizationService')

  async getOrganizationInfo(hubUrl: string, hubId: string): Promise<OrganizationInfo> {
    try {
      const url = new URL(hubUrl)

      // room-config API で organization_id を取得
      const roomConfigEndpoint = `${url.origin}/room-config/${hubId}`

      this.logger.debug('Fetching room config for organization info', { roomConfigEndpoint })

      const roomConfigResponse = await fetch(roomConfigEndpoint)
      if (!roomConfigResponse.ok) {
        throw new Error(
          `Failed to fetch room config: ${roomConfigResponse.status} ${roomConfigResponse.statusText}`,
        )
      }

      const roomConfigData = (await roomConfigResponse.json()) as RoomConfigResponse
      const organizationId = roomConfigData.result?.roomOrganization?.organization_id || null

      return {
        organizationId,
        realmId: organizationId || 'unknown',
      }
    } catch (error) {
      this.logger.error('Error fetching organization info:', { error })
      throw error
    }
  }

  async fetchOrganizationAvatars(
    hubUrl: string,
    organizationId: string,
  ): Promise<OrganizationAvatar[]> {
    try {
      const url = new URL(hubUrl)
      const basePath = resolveWorkersBasePath(url.hostname)
      const endpoint = `${url.origin}${basePath}/api/v1/organizations/${organizationId}/avatars/public`

      this.logger.debug('Fetching organization avatars', {
        hubUrl,
        organizationId,
        hostname: url.hostname,
        basePath,
        endpoint,
      })

      const response = await fetch(endpoint)

      this.logger.debug('Organization avatars API response', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error('Organization avatars API failed', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        })
        throw new Error(
          `Failed to fetch organization avatars: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }

      const data = (await response.json()) as OrganizationAvatarsResponse

      // APIレスポンスをOrganizationAvatar形式に変換
      const avatars: OrganizationAvatar[] = (data.result || []).map((item) => ({
        id: item.id,
        name: item.name,
        gltf: {
          avatar: item.gltf.avatar,
        },
        preview_url: item.images.preview.url,
      }))

      this.logger.debug('Organization avatars data received', {
        avatarCount: avatars.length,
        avatars: avatars.map((a) => ({ id: a.id, name: a.name })),
      })

      return avatars
    } catch (error) {
      this.logger.error('Error fetching organization avatars:', {
        hubUrl,
        organizationId,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      })
      throw error
    }
  }

  selectAvatar(
    avatars: OrganizationAvatar[],
    options?: {
      avatarId?: string
      avatarSelection?: 'random' | 'organization' | string
    },
  ): OrganizationAvatar | null {
    if (!avatars || avatars.length === 0) {
      return null
    }

    // 指定されたアバターIDが存在する場合はそれを使用
    if (options?.avatarId) {
      const specified = avatars.find((a) => a.id === options.avatarId)
      if (specified) {
        return specified
      }
    }

    // avatarSelectionが具体的なアバターIDの場合
    if (
      options?.avatarSelection &&
      options.avatarSelection !== 'random' &&
      options.avatarSelection !== 'organization'
    ) {
      const specified = avatars.find((a) => a.id === options.avatarSelection)
      if (specified) {
        return specified
      }
    }

    // ランダム選択の場合
    if (options?.avatarSelection === 'random') {
      const randomIndex = Math.floor(Math.random() * avatars.length)
      return avatars[randomIndex]
    }

    // デフォルトは最初のアバター（organizationまたは未指定）
    return avatars[0]
  }
}
