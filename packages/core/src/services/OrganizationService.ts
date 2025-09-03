import type {
  IOrganizationService,
  OrganizationAvatar,
  OrganizationInfo,
} from '../interfaces/IOrganizationService.js'
import { getLogger } from '../logging/index.js'

interface RealmResponse {
  result: {
    id: string // organization_id
    realm: string // realm_id
    public_key?: {
      keys: Array<{
        kid: string
        kty: string
        alg: string
        use: string
        n: string
        e: string
        x5c: string[]
        x5t: string
        'x5t#S256': string
      }>
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

export class OrganizationService implements IOrganizationService {
  private logger = getLogger('OrganizationService')

  async getOrganizationInfo(hubUrl: string, hubId: string): Promise<OrganizationInfo> {
    try {
      const url = new URL(hubUrl)
      const realmUrl = `${url.origin}/realm?room-id=${hubId}`

      this.logger.debug('Fetching organization info from realm', { realmUrl })

      const response = await fetch(realmUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch realm info: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as RealmResponse

      if (!data.result?.id || !data.result?.realm) {
        throw new Error('Invalid realm response: missing organization or realm ID')
      }

      return {
        organizationId: data.result.id,
        realmId: data.result.realm,
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
      let apiPath = '/api/v1'

      if (url.hostname.includes('-stg.')) {
        apiPath = '/api/admin/stg/api/v1'
      } else if (url.hostname.includes('-dev.')) {
        apiPath = '/api/admin/dev/api/v1'
      }

      const endpoint = `${url.origin}${apiPath}/organizations/${organizationId}/avatars/public`

      this.logger.debug('Fetching organization avatars', {
        hubUrl,
        organizationId,
        hostname: url.hostname,
        apiPath,
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
