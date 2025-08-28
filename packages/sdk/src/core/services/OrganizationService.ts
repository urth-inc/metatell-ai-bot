import { getLogger } from '../../sdk/logging/index.js'
import type {
  IOrganizationService,
  OrganizationAvatar,
  OrganizationInfo,
} from '../interfaces/IOrganizationService.js'

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
  avatars: OrganizationAvatar[]
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

      this.logger.debug('Fetching organization avatars', { endpoint })

      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new Error(
          `Failed to fetch organization avatars: ${response.status} ${response.statusText}`,
        )
      }

      const data = (await response.json()) as OrganizationAvatarsResponse
      return data.avatars || []
    } catch (error) {
      this.logger.error('Error fetching organization avatars:', { error })
      throw error
    }
  }

  selectAvatar(
    avatars: OrganizationAvatar[],
    options?: {
      avatarId?: string
      preferRandom?: boolean
    },
  ): string | null {
    if (!avatars || avatars.length === 0) {
      return null
    }

    // 指定されたアバターIDが存在する場合はそれを使用
    if (options?.avatarId) {
      const specified = avatars.find((a) => a.avatar_id === options.avatarId)
      if (specified) {
        return specified.avatar_id
      }
    }

    // ランダム選択またはデフォルトで最初のアバター
    if (options?.preferRandom) {
      const randomIndex = Math.floor(Math.random() * avatars.length)
      return avatars[randomIndex].avatar_id
    }

    // デフォルトは最初のアバター
    return avatars[0].avatar_id
  }
}
