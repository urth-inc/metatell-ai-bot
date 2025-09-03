import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LogEvent, LogSink } from '@metatell/sdk'

/**
 * File-based log sink for debug logging
 */
export class FileLogger implements LogSink {
  private filePath: string

  constructor(fileName?: string) {
    // Create log directory in user's home directory
    const logDir = join(homedir(), '.metatell-bot', 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    // Use provided filename or generate one based on current timestamp
    const logFileName = fileName || `bot-${new Date().toISOString().replace(/:/g, '-')}.log`
    this.filePath = join(logDir, logFileName)

    // Write session header
    const timestamp = new Date().toISOString()
    this.write({
      ts: Date.now(),
      level: 'info',
      module: 'FileLogger',
      message: `=== Log session started at ${timestamp} ===`,
    })

    // デバッグモードのメッセージはstderrに出力（stdoutのヘルプ表示と競合しないように）
    console.error(`📝 Debug logging enabled: ${this.filePath}`)
  }

  write(event: LogEvent): void {
    const timestamp = new Date(event.ts).toISOString()
    const level = event.level.toUpperCase().padEnd(5)
    const module = event.module.padEnd(25)

    let line = `[${timestamp}] [${level}] [${module}] ${event.message}`

    if (event.attributes !== undefined) {
      try {
        const attrStr = JSON.stringify(event.attributes, null, 2)
        if (attrStr !== '{}') {
          line += `\n${attrStr}`
        }
      } catch {
        line += ' [Unstringifiable attributes]'
      }
    }

    try {
      appendFileSync(this.filePath, `${line}\n`)
    } catch (error) {
      // Log error only once
      if (!this.hasLoggedError) {
        console.error('[FileLogger] Failed to write to log file:', error)
        this.hasLoggedError = true
      }
    }
  }

  private hasLoggedError = false

  getFilePath(): string {
    return this.filePath
  }
}
