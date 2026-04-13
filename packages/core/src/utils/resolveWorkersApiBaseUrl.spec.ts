import { describe, expect, it } from 'vitest'
import { resolveWorkersApiBaseUrl } from './resolveWorkersApiBaseUrl.js'

describe('resolveWorkersApiBaseUrl', () => {
  it('returns aws staging workers URL for metatell-stg.app', () => {
    expect(resolveWorkersApiBaseUrl('https://metatell-stg.app')).toBe(
      'https://v-air-admin-aws_staging.urth.workers.dev',
    )
  })

  it('returns aws development workers URL for metatell-dev.app', () => {
    expect(resolveWorkersApiBaseUrl('https://metatell-dev.app')).toBe(
      'https://v-air-admin-aws_development.urth.workers.dev',
    )
  })

  it('returns aws production workers URL for metatell.app', () => {
    expect(resolveWorkersApiBaseUrl('https://metatell.app')).toBe(
      'https://v-air-admin-aws_production.urth.workers.dev',
    )
  })

  it('returns local workers URL for localhost', () => {
    expect(resolveWorkersApiBaseUrl('http://localhost:4000')).toBe('http://127.0.0.1:3333')
  })

  it('falls back to origin for unknown hosts', () => {
    expect(resolveWorkersApiBaseUrl('https://example.com/some/path')).toBe('https://example.com')
  })
})
