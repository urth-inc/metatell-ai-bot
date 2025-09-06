import type {
  AuthCredentials,
  AuthToken,
  IAuthenticationService,
} from '../interfaces/IAuthenticationService.js'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider.js'

export class AuthenticationService implements IAuthenticationService {
  private token: AuthToken | null = null
  private configProvider: IConfigurationProvider

  constructor(configProvider: IConfigurationProvider) {
    this.configProvider = configProvider
  }

  async authenticate(credentials: AuthCredentials): Promise<AuthToken> {
    // If token is provided directly
    if (credentials.token) {
      this.token = {
        token: credentials.token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      }
      return this.token
    }

    // Get auth configuration from config provider
    const config = this.configProvider.getConfiguration()

    // For now, generate a mock token since the auth endpoint is not fully implemented
    // In production, this should make a real API call to the authentication server
    this.token = {
      token: `mock-token-${Date.now()}-${config.hubId || 'default'}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    }

    return this.token
  }

  async refreshToken(): Promise<AuthToken> {
    // Re-authenticate to get new token
    return this.authenticate({})
  }

  getToken(): AuthToken | null {
    // Check if token is expired
    if (this.token?.expiresAt && this.token.expiresAt < Date.now()) {
      this.token = null
    }
    return this.token
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null
  }

  logout(): void {
    this.token = null
  }
}
