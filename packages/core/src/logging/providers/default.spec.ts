import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LogSink } from '../spi.js'
import { DefaultLoggerProvider } from './default.js'

describe('DefaultLoggerProvider error metadata', () => {
  let provider: DefaultLoggerProvider
  let consoleError: ReturnType<typeof vi.spyOn>
  let sink: LogSink

  beforeEach(() => {
    provider = new DefaultLoggerProvider()
    provider.enableConsole(true)
    provider.setMinLevel('debug')
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    sink = { write: vi.fn() }
  })

  afterEach(() => {
    provider.unregisterSink(sink)
    consoleError.mockRestore()
  })

  it('should serialize Error properties nested in metadata', () => {
    const logger = provider.getLogger('AnimationService')

    logger.error('Failed to load animation', {
      animationId: 'wave',
      error: new TypeError('Animation not available'),
    })

    const output = String(consoleError.mock.calls[0][0])
    expect(output).toContain(
      '"error":{"name":"TypeError","message":"Animation not available","stack":"TypeError: Animation not available',
    )
    expect(output).not.toContain('"error":{}')
  })

  it('should send normalized Error metadata to sinks', () => {
    provider.registerSink(sink)
    const logger = provider.getLogger('AnimationService')

    logger.error('Avatar request failed', { error: new Error('HTTP 503') })

    expect(sink.write).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          error: {
            name: 'Error',
            message: 'HTTP 503',
            stack: expect.stringContaining('Error: HTTP 503'),
          },
        },
      }),
    )
  })

  it('should serialize an Error passed directly as metadata', () => {
    const logger = provider.getLogger('AnimationService')

    logger.error('Direct error', new Error('boom'))

    expect(String(consoleError.mock.calls[0][0])).toContain(
      '"name":"Error","message":"boom","stack":"Error: boom',
    )
  })
})
