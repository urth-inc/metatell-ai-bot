import type {
  IAuthenticationService,
  AuthToken,
  AuthCredentials,
} from '../interfaces/IAuthenticationService'
import type { IConfigurationProvider } from '../interfaces/IConfigurationProvider'

export class AuthenticationService implements IAuthenticationService {
  private token: AuthToken | null = null

  constructor(private configProvider: IConfigurationProvider) {}

  async authenticate(credentials: AuthCredentials): Promise<AuthToken> {
    const _config = this.configProvider.getConfiguration()

    // If token is provided directly
    if (credentials.token) {
      this.token = {
        token: credentials.token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      }
      return this.token
    }

    // For now, generate a mock token since the auth endpoint is not fully implemented
    // In production, this should make a real API call
    this.token = {
      token: `mock-token-${Date.now()}`,
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
