export interface AuthToken {
  token: string
  expiresAt?: number
}

export interface AuthCredentials {
  email?: string
  password?: string
  token?: string
}

export interface IAuthenticationService {
  authenticate(credentials: AuthCredentials): Promise<AuthToken>
  refreshToken(): Promise<AuthToken>
  getToken(): AuthToken | null
  isAuthenticated(): boolean
  logout(): void
}