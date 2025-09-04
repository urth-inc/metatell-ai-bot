/**
 * URL parsing utilities
 */

const METATELL_DOMAINS = ['metatell.app', 'metatell-stg.app', 'metatell-dev.app'] as const

/**
 * Check if hostname is a Metatell domain
 */
function isMetatellDomain(hostname: string): boolean {
  return METATELL_DOMAINS.some((domain) => hostname.endsWith(domain))
}

/**
 * Remove tenant subdomain from Metatell URL
 */
function removeMetatellTenantSubdomain(hostname: string): string {
  if (!isMetatellDomain(hostname)) {
    return hostname
  }

  // メタテルドメインの場合、ベースドメインに変換
  for (const domain of METATELL_DOMAINS) {
    if (hostname.endsWith(domain)) {
      return domain
    }
  }

  return hostname
}

export function parseUrl(url: string): { serverUrl: string; roomId: string } {
  try {
    const urlObj = new URL(url)

    // メタテルドメインの場合のみテナントサブドメインを除去
    const hostname = isMetatellDomain(urlObj.hostname)
      ? removeMetatellTenantSubdomain(urlObj.hostname)
      : urlObj.hostname

    const protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = urlObj.port ? `:${urlObj.port}` : ''
    const serverUrl = `${protocol}//${hostname}${port}`

    // Extract room ID from path - it's the first path segment
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    const roomId = pathParts[0] || 'default'

    if (!roomId || roomId === '/') {
      throw new Error('No room ID found in URL')
    }

    return { serverUrl, roomId }
  } catch (error) {
    throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
