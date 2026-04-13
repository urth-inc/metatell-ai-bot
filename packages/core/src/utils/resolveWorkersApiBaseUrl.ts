const DEVELOPMENT_WORKERS_API_BASE_URL = 'https://v-air-admin-aws_development.urth.workers.dev'
const STAGING_WORKERS_API_BASE_URL = 'https://v-air-admin-aws_staging.urth.workers.dev'
const PRODUCTION_WORKERS_API_BASE_URL = 'https://v-air-admin-aws_production.urth.workers.dev'
const LOCAL_WORKERS_API_BASE_URL = 'http://127.0.0.1:3333'

export function resolveWorkersApiBaseUrl(hubUrl: string): string {
  try {
    const { hostname, origin } = new URL(hubUrl)

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.localhost')
    ) {
      return LOCAL_WORKERS_API_BASE_URL
    }

    if (hostname === 'metatell-dev.app' || hostname.includes('-dev.')) {
      return DEVELOPMENT_WORKERS_API_BASE_URL
    }

    if (hostname === 'metatell-stg.app' || hostname.includes('-stg.')) {
      return STAGING_WORKERS_API_BASE_URL
    }

    if (hostname === 'metatell.app' || hostname.endsWith('.metatell.app')) {
      return PRODUCTION_WORKERS_API_BASE_URL
    }

    return origin
  } catch {
    return PRODUCTION_WORKERS_API_BASE_URL
  }
}
