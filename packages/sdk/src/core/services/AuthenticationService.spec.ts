import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BotConfiguration,
  IConfigurationProvider,
} from '../interfaces/IConfigurationProvider.js'
import { AuthenticationService } from './AuthenticationService.js'

describe('AuthenticationService', () => {
  let authService: AuthenticationService
  let mockConfigProvider: IConfigurationProvider

  beforeEach(() => {
    vi.useFakeTimers()

    mockConfigProvider = {
      get: vi.fn(),
      set: vi.fn(),
      getConfiguration: vi.fn(
        () =>
          ({
            authUrl: 'https://auth.test.app',
            hubUrl: 'https://hub.test.app',
            hubId: 'test-hub',
            profile: { displayName: 'TestBot', avatarId: 'test-avatar' },
          }) as BotConfiguration,
      ),
      updateProfile: vi.fn(),
      updateContext: vi.fn(),
    }

    authService = new AuthenticationService(mockConfigProvider)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('authenticate', () => {
    it('should authenticate with provided token', async () => {
      const credentials = { token: 'provided-token' }
      const authToken = await authService.authenticate(credentials)

      expect(authToken.token).toBe('provided-token')
      expect(authToken.expiresAt).toBeGreaterThan(Date.now())
      expect(authToken.expiresAt).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000)
    })

    it('should generate mock token when no token provided', async () => {
      const authToken = await authService.authenticate({})

      expect(authToken.token).toMatch(/^mock-token-\d+-test-hub$/)
      expect(authToken.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should store token after authentication', async () => {
      const credentials = { token: 'test-token' }
      await authService.authenticate(credentials)

      const storedToken = authService.getToken()
      expect(storedToken?.token).toBe('test-token')
    })

    it('should set expiration to 24 hours from now', async () => {
      const now = Date.now()
      const authToken = await authService.authenticate({ token: 'test' })

      const expectedExpiration = now + 24 * 60 * 60 * 1000
      expect(authToken.expiresAt).toBe(expectedExpiration)
    })
  })

  describe('refreshToken', () => {
    it('should generate new mock token', async () => {
      // First authentication
      const firstToken = await authService.authenticate({})
      const firstTokenValue = firstToken.token

      // Advance time slightly to ensure different timestamp
      vi.advanceTimersByTime(100)

      // Refresh token
      const refreshedToken = await authService.refreshToken()

      expect(refreshedToken.token).not.toBe(firstTokenValue)
      expect(refreshedToken.token).toMatch(/^mock-token-\d+-test-hub$/)
    })

    it('should update stored token', async () => {
      await authService.authenticate({ token: 'old-token' })

      vi.advanceTimersByTime(100)
      const refreshedToken = await authService.refreshToken()

      const storedToken = authService.getToken()
      expect(storedToken?.token).toBe(refreshedToken.token)
    })
  })

  describe('getToken', () => {
    it('should return null when not authenticated', () => {
      expect(authService.getToken()).toBeNull()
    })

    it('should return token when authenticated', async () => {
      await authService.authenticate({ token: 'test-token' })

      const token = authService.getToken()
      expect(token?.token).toBe('test-token')
    })

    it('should return null when token is expired', async () => {
      await authService.authenticate({ token: 'test-token' })

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000) // 25 hours

      expect(authService.getToken()).toBeNull()
    })

    it('should clear expired token', async () => {
      await authService.authenticate({ token: 'test-token' })
      expect(authService.isAuthenticated()).toBe(true)

      // Advance time past expiration
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      expect(authService.getToken()).toBeNull()
      expect(authService.isAuthenticated()).toBe(false)
    })
  })

  describe('isAuthenticated', () => {
    it('should return false when not authenticated', () => {
      expect(authService.isAuthenticated()).toBe(false)
    })

    it('should return true when authenticated', async () => {
      await authService.authenticate({ token: 'test-token' })
      expect(authService.isAuthenticated()).toBe(true)
    })

    it('should return false when token is expired', async () => {
      await authService.authenticate({ token: 'test-token' })

      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      expect(authService.isAuthenticated()).toBe(false)
    })

    it('should return true when token is not yet expired', async () => {
      await authService.authenticate({ token: 'test-token' })

      // Advance time but not past expiration
      vi.advanceTimersByTime(23 * 60 * 60 * 1000) // 23 hours

      expect(authService.isAuthenticated()).toBe(true)
    })
  })

  describe('logout', () => {
    it('should clear stored token', async () => {
      await authService.authenticate({ token: 'test-token' })
      expect(authService.isAuthenticated()).toBe(true)

      authService.logout()

      expect(authService.getToken()).toBeNull()
      expect(authService.isAuthenticated()).toBe(false)
    })

    it('should work even when not authenticated', () => {
      expect(() => authService.logout()).not.toThrow()
      expect(authService.isAuthenticated()).toBe(false)
    })
  })
})
