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
  const mockServerUrl = 'https://test.server'
  const mockHubId = 'test-hub-id'

  beforeEach(() => {
    vi.clearAllMocks()
    organizationService = new OrganizationService()
  })

  describe('getOrganizationInfo', () => {
    it('should fetch organization info successfully', async () => {
      const mockRealmResponse = {
        result: {
          id: 'org-123',
          realm: 'realm-456',
          public_key: {
            keys: [
              {
                kid: 'key-1',
                kty: 'RSA',
                alg: 'RS256',
                use: 'sig',
                n: 'test-n',
                e: 'AQAB',
                x5c: ['cert1'],
                x5t: 'thumbprint',
                'x5t#S256': 'thumbprint256',
              },
            ],
          },
        },
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockRealmResponse),
      } as MockResponse)

      const result = await organizationService.getOrganizationInfo(mockServerUrl, mockHubId)

      expect(result).toEqual({
        organizationId: 'org-123',
        realmId: 'realm-456',
      })

      expect(fetch).toHaveBeenCalledWith(`${mockServerUrl}/realm?room-id=${mockHubId}`)
    })

    it('should throw error when fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as MockResponse)

      await expect(
        organizationService.getOrganizationInfo(mockServerUrl, mockHubId),
      ).rejects.toThrow('Failed to fetch realm info: 404 Not Found')
    })

    it('should throw error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        organizationService.getOrganizationInfo(mockServerUrl, mockHubId),
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

      const result = await organizationService.fetchOrganizationAvatars(mockServerUrl, 'org-123')

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
        `${mockServerUrl}/api/v1/organizations/org-123/avatars/public`,
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

      const result = await organizationService.fetchOrganizationAvatars(mockServerUrl, 'org-123')

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
        organizationService.fetchOrganizationAvatars(mockServerUrl, 'org-123'),
      ).rejects.toThrow('Failed to fetch organization avatars: 403 Forbidden - Access denied')
    })

    it('should throw error on network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'))

      await expect(
        organizationService.fetchOrganizationAvatars(mockServerUrl, 'org-123'),
      ).rejects.toThrow('Connection refused')
    })

    it('should use both organization ID and hub ID in URL', async () => {
      const mockResponse = {
        status: 'success',
        result: [],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      } as MockResponse)

      await organizationService.fetchOrganizationAvatars(mockServerUrl, 'org-456')

      expect(fetch).toHaveBeenCalledWith(
        `${mockServerUrl}/api/v1/organizations/org-456/avatars/public`,
      )
    })
  })

  describe('constructor', () => {
    it('should handle server URLs with trailing slash', () => {
      const service = new OrganizationService('https://test.server/', 'hub-id')
      expect(service).toBeDefined()
    })

    it('should handle server URLs without protocol', () => {
      const service = new OrganizationService('test.server', 'hub-id')
      expect(service).toBeDefined()
    })
  })
})
