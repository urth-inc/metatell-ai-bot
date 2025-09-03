/**
 * Unit tests for ConfigManager with cosmiconfig
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock cosmiconfig at the module level
vi.mock('cosmiconfig', () => ({
  cosmiconfig: vi.fn(() => ({
    search: vi.fn(),
  })),
}))

import { cosmiconfig } from 'cosmiconfig'
import { ConfigManager } from './config.js'

describe('ConfigManager', () => {
  let configManager: ConfigManager
  let originalCwd: string
  let testDir: string
  let mockSearch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Save original cwd and create a test directory
    originalCwd = process.cwd()
    testDir = join(tmpdir(), `metatell-config-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Clear environment variables
    delete process.env.METATELL_URL
    delete process.env.METATELL_TOKEN
    delete process.env.METATELL_AUTH_TOKEN
    delete process.env.BOT_ACCESS_KEY
    delete process.env.BOT_NAME
    delete process.env.AVATAR_ID
    delete process.env.DEBUG

    // Set up cosmiconfig mock
    mockSearch = vi.fn()
    vi.mocked(cosmiconfig).mockReturnValue({
      search: mockSearch,
      clearCaches: vi.fn(),
      clearLoadCache: vi.fn(),
      clearSearchCache: vi.fn(),
      load: vi.fn(),
    })

    configManager = new ConfigManager()
  })

  afterEach(() => {
    // Restore cwd and clean up
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('cosmiconfig integration', () => {
    it('should load configuration from .metatellrc.json', async () => {
      const configContent = {
        url: 'https://metatell.app/test-room',
        token: 'test-token',
        profile: {
          displayName: 'Test Bot',
          avatarId: 'test-avatar',
        },
      }

      mockSearch.mockResolvedValue({
        config: configContent,
        filepath: join(testDir, '.metatellrc.json'),
      })

      const config = await configManager.getConfig()

      expect(config.url).toBe('https://metatell.app/test-room')
      expect(config.token).toBe('test-token')
      expect(config.profile?.displayName).toBe('Test Bot')
      expect(config.profile?.avatarId).toBe('test-avatar')
    })

    it('should support multiple config file formats', async () => {
      const configContent = {
        url: 'https://metatell.app/yaml-room',
        debug: true,
      }

      mockSearch.mockResolvedValue({
        config: configContent,
        filepath: join(testDir, '.metatellrc.yaml'),
      })

      const config = await configManager.getConfig()

      expect(config.url).toBe('https://metatell.app/yaml-room')
      expect(config.debug).toBe(true)
    })

    it('should load config from package.json metatell field', async () => {
      const packageJsonContent = {
        metatell: {
          url: 'https://metatell.app/package-room',
          profile: {
            displayName: 'Package Bot',
          },
        },
      }

      mockSearch.mockResolvedValue({
        config: packageJsonContent.metatell,
        filepath: join(testDir, 'package.json'),
      })

      const config = await configManager.getConfig()

      expect(config.url).toBe('https://metatell.app/package-room')
      expect(config.profile?.displayName).toBe('Package Bot')
    })
  })

  describe('priority handling', () => {
    it('should prioritize command line flags over all other sources', async () => {
      // Set environment variable
      process.env.METATELL_URL = 'https://metatell.app/env-room'

      // Mock config file
      mockSearch.mockResolvedValue({
        config: {
          url: 'https://metatell.app/file-room',
        },
      })

      // Command line flag should win
      const config = await configManager.getConfig({
        '--url': 'https://metatell.app/cli-room',
      })

      expect(config.url).toBe('https://metatell.app/cli-room')
    })

    it('should prioritize environment variables over config file', async () => {
      process.env.METATELL_TOKEN = 'env-token'

      mockSearch.mockResolvedValue({
        config: {
          token: 'file-token',
        },
      })

      const config = await configManager.getConfig()

      expect(config.token).toBe('env-token')
    })

    it('should merge profile configuration correctly', async () => {
      mockSearch.mockResolvedValue({
        config: {
          url: 'https://metatell.app/base-room',
          profile: {
            displayName: 'Base Bot',
          },
          profiles: {
            production: {
              url: 'https://metatell.app/prod-room',
              profile: {
                displayName: 'Production Bot',
                avatarId: 'prod-avatar',
              },
            },
          },
        },
      })

      const config = await configManager.getConfig({
        '--profile': 'production',
      })

      expect(config.url).toBe('https://metatell.app/prod-room')
      expect(config.profile?.displayName).toBe('Production Bot')
      expect(config.profile?.avatarId).toBe('prod-avatar')
    })
  })

  describe('environment variable handling', () => {
    it('should handle BOT_NAME and AVATAR_ID environment variables', async () => {
      process.env.BOT_NAME = 'Env Bot'
      process.env.AVATAR_ID = 'env-avatar'

      const config = await configManager.getConfig()

      expect(config.profile?.displayName).toBe('Env Bot')
      expect(config.profile?.avatarId).toBe('env-avatar')
    })

    it('should validate METATELL_URL environment variable', async () => {
      process.env.METATELL_URL = 'not-a-valid-url'

      const config = await configManager.getConfig()

      expect(config.url).toBeUndefined()
      expect(console.warn).toHaveBeenCalledWith('Invalid METATELL_URL: not-a-valid-url')
    })

    it('should handle DEBUG environment variable', async () => {
      process.env.DEBUG = 'true'

      const config = await configManager.getConfig()

      expect(config.debug).toBe(true)
    })
  })

  describe('token resolution', () => {
    it('should resolve token from file with @ syntax', async () => {
      const tokenFile = join(testDir, 'token.txt')
      writeFileSync(tokenFile, 'file-token-content\n')

      const config = await configManager.getConfig({
        '--token': `@${tokenFile}`,
      })

      expect(config.token).toBe('file-token-content')
    })

    it('should throw error for missing token file', async () => {
      await expect(
        configManager.getConfig({
          '--token': '@/non/existent/file.txt',
        }),
      ).rejects.toThrow('Token file not found: /non/existent/file.txt')
    })
  })

  describe('profile management', () => {
    it('should return available profiles', async () => {
      mockSearch.mockResolvedValue({
        config: {
          profiles: {
            development: {},
            staging: {},
            production: {},
          },
        },
      })

      const profiles = await configManager.getProfiles()

      expect(profiles).toEqual(['development', 'staging', 'production'])
    })

    it('should return empty array when no profiles defined', async () => {
      mockSearch.mockResolvedValue({
        config: {},
      })

      const profiles = await configManager.getProfiles()

      expect(profiles).toEqual([])
    })
  })

  describe('validation', () => {
    it('should warn when config file has invalid data', async () => {
      mockSearch.mockResolvedValue({
        config: {
          url: 'invalid-url', // Not a valid URL
        },
      })

      // Invalid URL in config file is warned but not thrown
      const config = await configManager.getConfig()

      // Config should be empty because invalid config was ignored
      expect(config.url).toBeUndefined()
      expect(console.warn).toHaveBeenCalledWith('Invalid config file format:', expect.any(Object))
    })

    it('should validate command line flags', async () => {
      // Flags are validated against FlagsSchema, which only allows specific flags
      await expect(
        configManager.getConfig({
          '--unknown-flag': 'value', // Unknown flag
        }),
      ).rejects.toThrow('Invalid command line flags:')
    })

    it('should validate URL from command line flags', async () => {
      // When invalid URL comes from flags, it should fail during flag validation
      await expect(
        configManager.getConfig({
          '--url': 'not-a-valid-url',
        }),
      ).rejects.toThrow('Invalid command line flags:')
    })
  })

  describe('caching', () => {
    it('should cache config file search results', async () => {
      mockSearch.mockResolvedValue({
        config: {
          url: 'https://metatell.app/cached-room',
        },
      })

      // First call
      await configManager.getConfig()

      // Second call should use cache
      await configManager.getConfig()

      expect(mockSearch).toHaveBeenCalledTimes(1)
    })

    it('should clear cache when clearCache is called', async () => {
      mockSearch.mockResolvedValue({
        config: {
          url: 'https://metatell.app/room',
        },
      })

      await configManager.getConfig()
      configManager.clearCache()
      await configManager.getConfig()

      expect(mockSearch).toHaveBeenCalledTimes(2)
    })
  })
})
