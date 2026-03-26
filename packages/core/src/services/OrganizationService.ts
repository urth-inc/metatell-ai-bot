import type {
  IOrganizationService,
  OrganizationAvatar,
  OrganizationInfo,
} from '../interfaces/IOrganizationService.js'
import { getLogger } from '../logging/index.js'

interface RealmFromDomainResponse {
  realm: string
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

  async getOrganizationInfo(hubUrl: string, domain: string): Promise<OrganizationInfo> {
    try {
      const url = new URL(hubUrl)
      const basePath = resolveWorkersBasePath(url.hostname)
      const endpoint = `${url.origin}${basePath}/api/v1/realm-from-domain?domain=${encodeURIComponent(domain)}`

      this.logger.debug('Fetching organization info from realm-from-domain', { endpoint, domain })

      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(`Failed to fetch realm info: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as RealmFromDomainResponse

      const realmId = typeof data?.realm === 'string' ? data.realm.trim() : ''
      if (!realmId) {
        throw new Error('Invalid realm response: missing realm ID')
      }

      return {
        organizationId: null,
        realmId,
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
      // URLから環境を判定（stgやdevの場合はそれをAPIパスに含める）
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
