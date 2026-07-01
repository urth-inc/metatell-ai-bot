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
 * Resolve the v-air-admin workers base URL from the hub hostname. Avatar listings
 * are served by the admin backend (not the metatell room workers), matching the
 * v-air_client behaviour (REACT_APP_VAIR_ADMIN_WORKERS_URL).
 */
function resolveAvatarApiBase(hostname: string): string {
  if (hostname.includes('-stg.')) return 'https://v-air-admin-staging.urth.workers.dev'
  if (hostname.includes('-dev.')) return 'https://v-air-admin-development.urth.workers.dev'
  return 'https://v-air-admin-production.urth.workers.dev'
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
      // v-air-admin backend の公開アバターAPIから取得する。
      // metatell-workers の /room-config/organization/... は公開アバターを返さないため参照先を修正。
      const adminBase = resolveAvatarApiBase(url.hostname)
      const endpoint = `${adminBase}/api/v1/organizations/${organizationId}/avatars/public`

      this.logger.debug('Fetching organization avatars', {
        hubUrl,
        organizationId,
        hostname: url.hostname,
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
