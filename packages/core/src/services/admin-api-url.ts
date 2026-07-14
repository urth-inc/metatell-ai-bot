const ADMIN_API_BASE_URLS = {
  development: 'https://v-air-admin-development.urth.workers.dev',
  staging: 'https://v-air-admin-staging.urth.workers.dev',
  production: 'https://v-air-admin-production.urth.workers.dev',
} as const

/**
 * Resolve the public admin API base URL for a metatell hub hostname.
 */
export function resolveAdminApiBaseUrl(hostname: string): string {
  if (hostname.includes('-stg.')) return ADMIN_API_BASE_URLS.staging
  if (hostname.includes('-dev.')) return ADMIN_API_BASE_URLS.development
  return ADMIN_API_BASE_URLS.production
}
