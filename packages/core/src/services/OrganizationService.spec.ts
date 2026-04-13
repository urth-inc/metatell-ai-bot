/**
 * Test for OrganizationService
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrganizationService } from './OrganizationService.js'

// Mock Response type for fetch tests
type MockResponse = Partial<Response> & {
  ok: boolean
  status?: number
  statusText?: string
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}

// Mock logger
vi.mock('../logging/index.js', () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock fetch
global.fetch = vi.fn()

describe('OrganizationService', () => {
  let organizationService: OrganizationService
  const mockHubUrl = 'https://test.server'
  const mockApiBaseUrl = 'https://workers.test.server'
  const mockHubId = 'test-hub-id'

  beforeEach(() => {
    vi.clearAllMocks()
    organizationService = new OrganizationService()
  })

  describe('getOrganizationInfo', () => {
    it('should fetch organization info from room-config', async () => {
      const mockRoomConfigResponse = {
        status: 'ok',
        result: {
          roomOrganization: {
            room_id: mockHubId,
            organization_id: 'org-123',
          },
        },
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRoomConfigResponse),
      } as MockResponse)

      const result = await organizationService.getOrganizationInfo(mockHubUrl, mockHubId)

      expect(result).toEqual({
        organizationId: 'org-123',
        realmId: 'org-123',
      })

      expect(fetch).toHaveBeenCalledWith(`${mockHubUrl}/room-config/${mockHubId}`)
    })

    it('should return null organizationId when roomOrganization is missing', async () => {
      const mockRoomConfigResponse = {
        status: 'ok',
        result: {},
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRoomConfigResponse),
      } as MockResponse)

      const result = await organizationService.getOrganizationInfo(mockHubUrl, mockHubId)

      expect(result).toEqual({
        organizationId: null,
        realmId: 'unknown',
      })
    })

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as MockResponse)

      await expect(
        organizationService.getOrganizationInfo(mockHubUrl, mockHubId),
      ).rejects.toThrow('Failed to fetch room config: 404 Not Found')
    })

    it('should throw error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        organizationService.getOrganizationInfo(mockHubUrl, mockHubId),
      ).rejects.toThrow('Network error')
    })
  })

  describe('fetchOrganizationAvatars', () => {
    it('should fetch organization avatars successfully', async () => {
      const mockAvatarsResponse = {
        status: 'success',
        result: [
          {
            id: 'avatar-1',
            name: 'Avatar One',
            url: 'https://example.com/avatar1',
            type: '3d',
            allow_remixing: true,
            attributions: { creator: 'Creator 1' },
            description: 'Test avatar',
            gltf: {
              avatar: 'https://example.com/avatar1.glb',
              base: 'https://example.com/base1.glb',
            },
            images: {
              preview: {
                url: 'https://example.com/preview1.jpg',
                height: 512,
                width: 512,
              },
            },
          },
          {
            id: 'avatar-2',
            name: 'Avatar Two',
            url: 'https://example.com/avatar2',
            type: '3d',
            allow_remixing: false,
            attributions: { creator: 'Creator 2' },
            description: null,
            gltf: {
              avatar: 'https://example.com/avatar2.glb',
              base: 'https://example.com/base2.glb',
            },
            images: {
              preview: {
                url: 'https://example.com/preview2.jpg',
                height: 256,
                width: 256,
              },
            },
          },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockAvatarsResponse),
      } as MockResponse)

      const result = await organizationService.fetchOrganizationAvatars(mockApiBaseUrl, 'org-123')

      expect(result).toEqual([
        {
          id: 'avatar-1',
          name: 'Avatar One',
          gltf: {
            avatar: 'https://example.com/avatar1.glb',
          },
          preview_url: 'https://example.com/preview1.jpg',
        },
        {
          id: 'avatar-2',
          name: 'Avatar Two',
          gltf: {
            avatar: 'https://example.com/avatar2.glb',
          },
          preview_url: 'https://example.com/preview2.jpg',
        },
      ])

      expect(fetch).toHaveBeenCalledWith(
        `${mockApiBaseUrl}/api/v1/organizations/org-123/avatars/public`,
      )
    })

    it('should return empty array when no avatars found', async () => {
      const mockAvatarsResponse = {
        status: 'success',
        result: [],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockAvatarsResponse),
      } as MockResponse)

      const result = await organizationService.fetchOrganizationAvatars(mockApiBaseUrl, 'org-123')

      expect(result).toEqual([])
    })

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: vi.fn().mockResolvedValue('Access denied'),
      } as MockResponse)

      await expect(
        organizationService.fetchOrganizationAvatars(mockApiBaseUrl, 'org-123'),
      ).rejects.toThrow('Failed to fetch organization avatars: 403 Forbidden - Access denied')
    })

    it('should throw error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'))

      await expect(
        organizationService.fetchOrganizationAvatars(mockApiBaseUrl, 'org-123'),
      ).rejects.toThrow('Connection refused')
    })

    it('should use staging API path for stg hostname', async () => {
      const mockResponse = {
        status: 'success',
        result: [],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as MockResponse)

      await organizationService.fetchOrganizationAvatars('https://metatell-stg.app', 'org-456')

      expect(fetch).toHaveBeenCalledWith(
        'https://metatell-stg.app/api/v1/organizations/org-456/avatars/public',
      )
    })

    it('should use dev API path for dev hostname', async () => {
      const mockResponse = {
        status: 'success',
        result: [],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as MockResponse)

      await organizationService.fetchOrganizationAvatars('https://metatell-dev.app', 'org-789')

      expect(fetch).toHaveBeenCalledWith(
        'https://metatell-dev.app/api/v1/organizations/org-789/avatars/public',
      )
    })
  })

  describe('selectAvatar', () => {
    const mockAvatars = [
      { id: 'a1', name: 'Avatar 1', gltf: { avatar: 'url1' } },
      { id: 'a2', name: 'Avatar 2', gltf: { avatar: 'url2' } },
    ]

    it('should return null for empty array', () => {
      expect(organizationService.selectAvatar([])).toBeNull()
    })

    it('should return first avatar by default', () => {
      expect(organizationService.selectAvatar(mockAvatars)).toEqual(mockAvatars[0])
    })

    it('should return specified avatar by id', () => {
      expect(organizationService.selectAvatar(mockAvatars, { avatarId: 'a2' })).toEqual(
        mockAvatars[1],
      )
    })
  })
})
