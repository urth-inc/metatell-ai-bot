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

  // メタテルの各ドメインをチェック
  for (const domain of METATELL_DOMAINS) {
    if (hostname.endsWith(domain)) {
      const domainParts = domain.split('.')
      const baseDomainLength = domainParts.length

      // ホスト名のパート数がベースドメインより多い場合、テナントサブドメインがある
      if (parts.length > baseDomainLength) {
        return domain
      }
    }
  }

  // メタテルドメインでない場合、または既にベースドメインの場合はそのまま返す
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

  // メタテルドメインの場合のみテナントサブドメインを除去
  const hostname = isMetatellDomain(urlObj.hostname)
    ? removeMetatellTenantSubdomain(urlObj.hostname)
    : urlObj.hostname

  // HTTPSからWSSに変換
  const protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:'
  const port = urlObj.port ? `:${urlObj.port}` : ''
  const serverUrl = `${protocol}//${hostname}${port}`

  // Hub IDを取得
  const pathParts = urlObj.pathname.split('/').filter(Boolean)
  // 'a' プレフィックスをスキップ
  const hubId = pathParts[0] === 'a' && pathParts.length > 1 ? pathParts[1] : pathParts[0]

  if (!hubId) {
    throw new Error('Invalid room URL: hub ID not found')
  }

  return { serverUrl, hubId }
}
