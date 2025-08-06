import './websocket-polyfill'
import { 
  type Channel, 
  Presence, 
  Socket,
  type PresenceOnJoinCallback,
  type PresenceOnLeaveCallback,
  type SocketOptions 
} from 'phoenix'

export interface MetatellProfile {
  displayName: string
  avatarId?: string
  identityName?: string
  [key: string]: string | number | boolean | undefined
}

export interface MetatellContext {
  entering?: boolean
  [key: string]: string | number | boolean | undefined
}

export interface MetatellConfig {
  socketUrl?: string
  hubId?: string
  authToken?: string
  permsToken?: string
  botAccessKey?: string
  profile?: MetatellProfile
  context?: MetatellContext
  sessionToken?: string
  debug?: boolean
}

export interface JoinResponse {
  session_id: string
  perms_token?: string
  [key: string]: string | number | boolean | undefined
}

export interface MessagePayload {
  body: string
  type: string
  from_session_id?: string
  session_id?: string
  [key: string]: string | number | boolean | undefined
}

export interface NAFData {
  dataType?: string
  data: {
    networkId?: string
    owner?: string
    creator?: string
    lastOwnerTime?: number
    template?: string
    persistent?: boolean
    isFirstSync?: boolean
    parent?: null | string
    forceRender?: boolean
    megaphone?: boolean
    temporaryMegaphone?: boolean
    components?: Record<string, unknown> | unknown[]
    d?: Array<{
      networkId: string
      owner: string
      creator: string
      lastOwnerTime: number
      template: string
      persistent: boolean
      parent: null | string
      components: Record<string, unknown>
    }>
    [key: string]: string | number | boolean | Record<string, unknown> | unknown[] | null | undefined
  }
}

export interface PresenceMeta {
  profile: MetatellProfile
  context?: MetatellContext
  permissions?: Record<string, boolean>
  roles?: Record<string, boolean>
  phx_ref?: string
  online_at?: string
}

export interface PresenceData {
  metas: PresenceMeta[]
}

export interface PresenceUser {
  id: string
  profile: MetatellProfile
  context: MetatellContext
  permissions: Record<string, boolean>
  roles: Record<string, boolean>
}

export interface HubRefreshPayload {
  stale_fields: string[]
  session_id: string
  [key: string]: string | string[] | undefined
}

export class MetatellClient {
  protected config: Required<MetatellConfig>
  private socket: Socket | null = null
  private hubChannel: Channel | null = null
  private presence: Presence | null = null
  private sessionId: string | null = null

  constructor(config: MetatellConfig = {}) {
    this.config = {
      socketUrl: config.socketUrl || 'wss://localhost:4443',
      hubId: config.hubId || '',
      authToken: config.authToken || '',
      permsToken: config.permsToken || '',
      botAccessKey: config.botAccessKey || '',
      profile: config.profile || {
        displayName: 'AI Bot',
        avatarId: '',
      },
      context: config.context || {},
      sessionToken: config.sessionToken || '',
      debug: config.debug || false,
    }
  }

  async connect(): Promise<void> {
    const socketParams: Record<string, string> = {}
    if (this.config.sessionToken) {
      socketParams.session_token = this.config.sessionToken
    }

    // Phoenix Socket options
    const socketOptions: SocketOptions = {
      params: socketParams,
    }

    // Node.js環境でのWebSocket接続設定
    const globalWithWs = global as typeof globalThis & { WebSocket?: typeof WebSocket }
    if (globalWithWs.WebSocket) {
      socketOptions.transport = globalWithWs.WebSocket as SocketOptions['transport']
    }

    if (this.config.debug) {
      socketOptions.logger = (kind: string, msg: string, data: unknown) => {
        console.log(`${kind}: ${msg}`, data)
      }
    }

    this.socket = new Socket(`${this.config.socketUrl}/socket`, socketOptions)

    this.socket.onOpen(() => console.log('Socket connected'))
    this.socket.onError((error: unknown) => console.error('Socket error:', error))
    this.socket.onClose(() => console.log('Socket disconnected'))

    this.socket.connect()

    await this.waitForConnection()

    console.log('Connected to Metatell socket')
  }

  async joinHub(hubId: string = this.config.hubId): Promise<JoinResponse> {
    if (!hubId) {
      throw new Error('Hub ID is required')
    }

    if (!this.socket) {
      throw new Error('Socket not connected')
    }

    const channelParams: Record<string, unknown> = {
      profile: this.config.profile,
      context: this.config.context,
    }

    if (this.config.authToken) {
      channelParams.auth_token = this.config.authToken
    }

    if (this.config.permsToken) {
      channelParams.perms_token = this.config.permsToken
    }

    if (this.config.botAccessKey) {
      channelParams.bot_access_key = this.config.botAccessKey
    }

    this.hubChannel = this.socket.channel(`hub:${hubId}`, channelParams)

    this.presence = new Presence(this.hubChannel)

    this.presence.onSync(() => {
      console.log('Presence state:', this.presence?.list())
    })

    this.presence.onJoin(((id, current, newPres) => {
      if (!current) {
        console.log('User joined:', id, newPres)
        const presenceData: PresenceData = {
          metas: 'metas' in newPres ? ((newPres as unknown) as PresenceData).metas : []
        }
        this.onUserJoin(id, presenceData)
      }
    }) as PresenceOnJoinCallback)

    this.presence.onLeave(((id, current, leftPres) => {
      if (current && 'metas' in current && ((current as unknown) as PresenceData).metas.length === 0) {
        console.log('User left:', id, leftPres)
        const presenceData: PresenceData = {
          metas: 'metas' in leftPres ? ((leftPres as unknown) as PresenceData).metas : []
        }
        this.onUserLeave(id, presenceData)
      }
    }) as PresenceOnLeaveCallback)

    this.hubChannel.on('message', (payload: MessagePayload) => {
      this.handleMessage(payload)
    })

    this.hubChannel.on('hub_refresh', (payload: HubRefreshPayload) => {
      this.handleHubRefresh(payload)
    })

    this.hubChannel.on('naf', (payload: NAFData) => {
      this.handleNAF(payload)
    })

    this.hubChannel.on('nafr', (payload: NAFData) => {
      this.handleNAFR(payload)
    })

    this.hubChannel.on('pin', (payload: { object_id: string; gltf_node: unknown }) => {
      this.handlePin(payload)
    })

    this.hubChannel.on('unpin', (payload: { object_id: string }) => {
      this.handleUnpin(payload)
    })

    this.hubChannel.on('presence_state', (state: Record<string, PresenceData>) => {
      console.log('Initial presence state:', state)
    })

    this.hubChannel.on(
      'presence_diff',
      (diff: { joins: Record<string, PresenceData>; leaves: Record<string, PresenceData> }) => {
        console.log('Presence diff:', diff)
      },
    )

    return new Promise((resolve, reject) => {
      this.hubChannel
        ?.join()
        .receive('ok', (response: JoinResponse) => {
          console.log('Joined hub successfully:', response)
          this.sessionId = response.session_id
          if (response.perms_token) {
            this.config.permsToken = response.perms_token
          }
          resolve(response)
        })
        .receive('error', (response: unknown) => {
          console.error('Failed to join hub:', response)
          reject(response)
        })
        .receive('timeout', () => {
          console.error('Join timeout')
          reject(new Error('Join timeout'))
        })
    })
  }

  async enterRoom(): Promise<void> {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('events:entering', {})

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const enteredPayload = {
      initialOccupantCount: this.presence ? Object.keys(this.presence.state).length : 0,
      isNewDaily: true,
      isNewMonthly: true,
      isNewDayWindow: true,
      isNewMonthWindow: true,
      entryDisplayType: 'Bot',
      userAgent: 'MetatellBot/1.0',
    }

    this.hubChannel.push('events:entered', enteredPayload)
  }

  sendMessage(body: string, type: string = 'chat'): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('message', { body, type })
  }

  sendNAF(data: NAFData): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('naf', data)
    console.log('Sent NAF message:', JSON.stringify(data, null, 2))
  }

  sendNAFR(data: NAFData): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('nafr', { naf: JSON.stringify(data) })
    console.log('Sent NAFR message:', JSON.stringify(data, null, 2))
  }

  spawnObject(networkId: string, template: string, components: Record<string, unknown>): void {
    if (!this.sessionId) {
      throw new Error('Session ID not available')
    }

    const nafData: NAFData = {
      dataType: 'u',
      data: {
        networkId,
        owner: this.sessionId,
        creator: this.sessionId,
        template,
        persistent: false,
        isFirstSync: true,
        components,
      },
    }

    this.sendNAF(nafData)
  }

  updateObject(networkId: string, components: Record<string, unknown>): void {
    if (!this.sessionId) {
      throw new Error('Session ID not available')
    }

    const nafData = {
      dataType: 'u',
      data: {
        networkId,
        owner: this.sessionId,
        components,
      },
    }

    this.sendNAFR(nafData)
  }

  updateProfile(profile: Partial<MetatellProfile>): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.config.profile = { ...this.config.profile, ...profile }
    this.hubChannel.push('events:profile_updated', { profile: this.config.profile })
  }

  async signIn(authToken: string): Promise<string> {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    return new Promise((resolve, reject) => {
      this.hubChannel
        ?.push('sign_in', { token: authToken })
        .receive('ok', ({ perms_token }: { perms_token: string }) => {
          console.log('Signed in successfully')
          this.config.permsToken = perms_token
          resolve(perms_token)
        })
        .receive('error', (err: unknown) => {
          console.error('Sign in failed:', err)
          reject(err)
        })
    })
  }

  async refreshPermsToken(): Promise<string> {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    return new Promise((resolve, reject) => {
      this.hubChannel
        ?.push('refresh_perms_token', {})
        .receive('ok', ({ perms_token }: { perms_token: string }) => {
          this.config.permsToken = perms_token
          resolve(perms_token)
        })
        .receive('error', reject)
    })
  }

  pinObject(objectId: string, gltfNode: unknown): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('pin', { id: objectId, gltf_node: gltfNode })
  }

  unpinObject(objectId: string): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('unpin', { id: objectId })
  }

  raiseHand(): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('events:raise_hand', {})
  }

  lowerHand(): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('events:lower_hand', {})
  }

  beginTyping(): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('events:begin_typing', {})
  }

  endTyping(): void {
    if (!this.hubChannel) {
      throw new Error('Not connected to hub')
    }

    this.hubChannel.push('events:end_typing', {})
  }

  protected handleMessage(payload: MessagePayload): void {
    console.log('Received message:', payload)
  }

  protected handleHubRefresh(payload: HubRefreshPayload): void {
    console.log('Hub refreshed:', payload)
  }

  protected handleNAF(_payload: NAFData): void {
    // Override in subclass
  }

  protected handleNAFR(_payload: NAFData): void {
    // Override in subclass
  }

  protected handlePin(payload: { object_id: string; gltf_node: unknown }): void {
    console.log('Object pinned:', payload)
  }

  protected handleUnpin(payload: { object_id: string }): void {
    console.log('Object unpinned:', payload)
  }

  protected onUserJoin(_id: string, _presence: PresenceData): void {
    // Override in subclass
  }

  protected onUserLeave(_id: string, _presence: PresenceData): void {
    // Override in subclass
  }

  leave(): void {
    if (this.hubChannel) {
      this.hubChannel.leave()
      this.hubChannel = null
      this.presence = null
    }
  }

  disconnect(): void {
    this.leave()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (this.socket?.isConnected()) {
          resolve()
        } else {
          setTimeout(checkConnection, 100)
        }
      }
      checkConnection()
    })
  }

  getPresenceList(): Record<string, PresenceUser> {
    if (!this.presence) {
      return {}
    }

    const list: Record<string, PresenceUser> = {}

    this.presence.list((id: string, presence: unknown) => {
      if (presence && typeof presence === 'object' && 'metas' in presence) {
        const presData = presence as PresenceData
        const metas = presData.metas || []
        const [first] = metas
        if (first) {
          list[id] = {
            id,
            profile: first.profile || { displayName: 'Unknown' },
            context: first.context || {},
            permissions: first.permissions || {},
            roles: first.roles || {},
          }
        }
      }
    })

    return list
  }

  userCan(sessionId: string, permission: string): boolean {
    if (!this.presence) {
      return false
    }

    const presenceState = this.presence.state[sessionId]
    if (!presenceState || !presenceState.metas[0]) {
      return false
    }

    return !!presenceState.metas[0].permissions?.[permission]
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  isConnected(): boolean {
    return this.socket ? this.socket.isConnected() : false
  }
}
