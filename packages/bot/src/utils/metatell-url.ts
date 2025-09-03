/**
 * Metatell URL utilities
 */

const METATELL_DOMAINS = ['metatell.app', 'metatell-stg.app', 'metatell-dev.app'] as const

/**
 * Check if hostname is a Metatell domain (with or without tenant subdomain)
 */
export function isMetatellDomain(hostname: string): boolean {
  return METATELL_DOMAINS.some((domain) => hostname.endsWith(domain))
}

/**
 * Remove tenant subdomain from Metatell URL
 *
 * Examples:
 * - urth.metatell.app → metatell.app
 * - tenant.metatell-stg.app → metatell-stg.app
 * - metatell-dev.app → metatell-dev.app (no change)
 * - example.com → example.com (no change)
 */
export function removeMetatellTenantSubdomain(hostname: string): string {
  const parts = hostname.split('.')

  // Check each Metatell domain
  for (const domain of METATELL_DOMAINS) {
    if (hostname.endsWith(domain)) {
      const domainParts = domain.split('.')
      const baseDomainLength = domainParts.length

      // If the number of hostname parts is greater than the base domain, a tenant subdomain exists
      if (parts.length > baseDomainLength) {
        return domain
      }
    }
  }

  // If not a Metatell domain or already a base domain, return as is
  return hostname
}

/**
 * Process Metatell URL for WebSocket connection
 *
 * @param url - Original room URL
 * @returns Processed WebSocket URL and hub ID
 */
export function processMetatellUrl(url: string): { serverUrl: string; hubId: string } {
  const urlObj = new URL(url)

  // Remove tenant subdomain only for Metatell domains
  const hostname = isMetatellDomain(urlObj.hostname)
    ? removeMetatellTenantSubdomain(urlObj.hostname)
    : urlObj.hostname

  // Convert HTTPS to WSS
  const protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:'
  const port = urlObj.port ? `:${urlObj.port}` : ''
  const serverUrl = `${protocol}//${hostname}${port}`

  // Get hub ID
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  // Skip 'a' prefix
  const hubId = pathParts[0] === 'a' && pathParts.length > 1 ? pathParts[1] : pathParts[0]

  if (!hubId) {
    throw new Error('Invalid room URL: hub ID not found')
  }

  return { serverUrl, hubId }
}
