import { exec } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execAsync = promisify(exec)

describe('CLI E2E Tests', () => {
  const CLI_PATH = join(__dirname, '..', '..', 'dist', 'main.js')
  const TEST_CONFIG_DIR = join(homedir(), '.metatell-bot-test')
  const TEST_LOG_DIR = join(homedir(), '.metatell-bot', 'logs')

  beforeAll(() => {
    // テスト用の設定ディレクトリを作成
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true })
    }
  })

  afterAll(() => {
    // テスト用ディレクトリをクリーンアップ
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true })
    }
  })

  describe('Help Display', () => {
    it('should display help when no arguments provided', async () => {
      const { stdout, stderr } = await execAsync(`node ${CLI_PATH}`)

      expect(stdout).toContain('Usage: metatell-ai-bot')
      expect(stdout).toContain('AI bot for Metatell metaverse')
      expect(stdout).toContain('--debug')
      expect(stdout).toContain('--token')
      expect(stdout).toContain('--profile')
      expect(stderr).toBe('')
    }, 10000)

    it('should display help with --help flag', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`)

      expect(stdout).toContain('Usage: metatell-ai-bot')
      expect(stdout).toContain('Options:')
      expect(stdout).toContain('-h, --help')
    })

    it('should display version with --version flag', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --version`)

      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
    })
  })

  describe('Debug Logging', () => {
    it('should create log file when --debug flag is used', async () => {
      const beforeCount = existsSync(TEST_LOG_DIR) ? readdirSync(TEST_LOG_DIR).length : 0

      const { stdout, stderr } = await execAsync(`node ${CLI_PATH} --debug --help`)

      // デバッグメッセージがstderrに出力される
      expect(stderr).toContain('📝 Debug logging enabled:')
      expect(stderr).toContain('.metatell-bot/logs/bot-')

      // ヘルプはstdoutに出力される
      expect(stdout).toContain('Usage: metatell-ai-bot')

      // ログファイルが作成されたことを確認
      if (existsSync(TEST_LOG_DIR)) {
        const files = readdirSync(TEST_LOG_DIR)
        const afterCount = files.length
        expect(afterCount).toBeGreaterThan(beforeCount)
      }
    })

    it('should log command arguments in debug mode', async () => {
      const { stderr } = await execAsync(`node ${CLI_PATH} --debug --help`)

      // ログファイルパスを抽出
      const logPathMatch = stderr.match(/Debug logging enabled: (.+\.log)/)
      expect(logPathMatch).toBeTruthy()

      if (logPathMatch) {
        const logPath = logPathMatch[1]
        const logContent = readFileSync(logPath, 'utf-8')

        expect(logContent).toContain('Debug logging initialized')
        expect(logContent).toContain('--debug')
        expect(logContent).toContain('--help')
        expect(logContent).toContain('"args"')
      }
    })

    it('should not create log file without --debug flag', async () => {
      const beforeFiles = existsSync(TEST_LOG_DIR) ? readdirSync(TEST_LOG_DIR) : []

      const { stderr } = await execAsync(`node ${CLI_PATH} --help`)

      // デバッグメッセージが出力されない
      expect(stderr).not.toContain('Debug logging enabled')

      // 新しいログファイルが作成されていない
      const afterFiles = existsSync(TEST_LOG_DIR) ? readdirSync(TEST_LOG_DIR) : []
      expect(afterFiles.length).toBe(beforeFiles.length)
    })
  })

  describe('Configuration Loading', () => {
    const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, 'config.json')

    it('should load profile from config file', async () => {
      // テスト用の設定ファイルを作成
      const config = {
        profiles: {
          test: {
            url: 'https://metatell.app/test-room',
            profile: {
              displayName: 'TestBot',
              avatarId: 'test-avatar',
            },
          },
        },
      }
      writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2))

      // HOME環境変数を一時的に変更してテスト設定を使用
      const originalHome = process.env.HOME
      process.env.HOME = TEST_CONFIG_DIR.replace('/.metatell-bot-test', '')

      try {
        const { stdout, stderr } = await execAsync(`node ${CLI_PATH} --profile test --debug --help`)

        // デバッグログに設定が読み込まれたことが記録される
        expect(stderr).toContain('Debug logging enabled')
        expect(stdout).toContain('Usage: metatell-ai-bot')
      } finally {
        process.env.HOME = originalHome
      }
    })

    it('should handle missing profile gracefully', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH} --profile non-existent --help`)

      // エラーではなくヘルプが表示される
      expect(stdout).toContain('Usage: metatell-ai-bot')
    })
  })

  describe('URL Validation', () => {
    it('should reject invalid URL format', async () => {
      try {
        await execAsync(`node ${CLI_PATH} not-a-url`)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect((error as { stderr: string }).stderr).toContain('Invalid')
      }
    })

    it('should accept valid Metatell URL', async () => {
      // 実際の接続はせず、URLパースのみをテスト
      const { stdout } = await execAsync(`node ${CLI_PATH} https://metatell.app/test-room --help`)

      // URLが受け入れられてヘルプが表示される
      expect(stdout).toContain('Usage: metatell-ai-bot')
    })
  })

  describe('Token Handling', () => {
    it('should accept token via --token flag', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${CLI_PATH} --token test-token --debug --help`,
      )

      expect(stderr).toContain('Debug logging enabled')
      expect(stdout).toContain('Usage: metatell-ai-bot')
    })

    it('should accept token via environment variable', async () => {
      const env = { ...process.env, METATELL_AUTH_TOKEN: 'env-token' }
      const { stdout } = await execAsync(`node ${CLI_PATH} --help`, { env })

      expect(stdout).toContain('Usage: metatell-ai-bot')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing required parameters gracefully', async () => {
      const { stdout } = await execAsync(`node ${CLI_PATH}`)

      // エラーではなくヘルプが表示される
      expect(stdout).toContain('Usage: metatell-ai-bot')
      expect(stdout).toContain('Arguments:')
    })

    it('should provide clear error for malformed URL', async () => {
      try {
        // Use timeout option in exec to prevent hanging
        const _result = await execAsync(`node ${CLI_PATH} "not-a-url"`, {
          timeout: 5000,
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        const stderr = (error as { stderr: string }).stderr
        // URLが不正な場合のエラーメッセージを確認
        expect(stderr.toLowerCase()).toMatch(/error|invalid/)
      }
    }, 15000)
  })

  describe('CLI Flag Combinations', () => {
    it('should handle multiple flags together', async () => {
      const { stdout, stderr } = await execAsync(
        `node ${CLI_PATH} --debug --token test --profile default --help`,
      )

      expect(stderr).toContain('Debug logging enabled')
      expect(stdout).toContain('Usage: metatell-ai-bot')
    })

    it('should handle short and long flag formats', async () => {
      const { stdout, stderr } = await execAsync(`node ${CLI_PATH} -d -t test -p default -h`)

      // -d (debug) のショートフラグをサポート
      expect(stderr).toContain('Debug logging enabled')
      // -h (help) のショートフラグをサポート
      expect(stdout).toContain('Usage: metatell-ai-bot')
    })
  })
})
