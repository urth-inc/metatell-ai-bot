/**
 * Test for CLI main exports
 */

import { describe, expect, it } from 'vitest'
import { connectCommand, inspectCommand, startInteractiveMode } from './index.js'

describe('CLI exports', () => {
  it('should export connectCommand', () => {
    expect(connectCommand).toBeDefined()
    expect(typeof connectCommand).toBe('function')
  })

  it('should export inspectCommand', () => {
    expect(inspectCommand).toBeDefined()
    expect(typeof inspectCommand).toBe('function')
  })

  it('should export startInteractiveMode', () => {
    expect(startInteractiveMode).toBeDefined()
    expect(typeof startInteractiveMode).toBe('function')
  })
})
