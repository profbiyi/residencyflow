// Keycloak OIDC Authentication Service

interface KeycloakConfig {
  keycloak_url: string;
  realm: string;
  client_id: string;
  auth_endpoint: string;
  token_endpoint: string;
}

class KeycloakService {
  private config: KeycloakConfig | null = null;
  private readonly API_URL = import.meta.env.VITE_API_URL || '';

  /**
   * Initialize Keycloak configuration from backend
   */
  async init(): Promise<void> {
    if (this.config) return;

    try {
      const response = await fetch(`${this.API_URL}/auth/config`);
      this.config = await response.json();
    } catch (error) {
      console.error('Failed to initialize Keycloak config:', error);
      throw new Error('Keycloak configuration unavailable');
    }
  }

  /**
   * Generate PKCE code verifier and challenge for secure OAuth2 flow
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Start login flow - redirect to Keycloak
   */
  async login(): Promise<void> {
    await this.init();
    if (!this.config) throw new Error('Keycloak not configured');

    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // Store verifier for later use in callback
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);
    sessionStorage.setItem('auth_redirect_uri', window.location.href);

    // Build authorization URL
    const redirectUri = `${window.location.origin}/callback`;
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    // Redirect to Keycloak login
    window.location.href = `${this.config.auth_endpoint}?${params.toString()}`;
  }

  /**
   * Handle OAuth2 callback - exchange code for tokens
   */
  async handleCallback(code: string): Promise<any> {
    try {
      const response = await fetch(`${this.API_URL}/auth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Authentication failed');
      }

      const data = await response.json();

      // Store tokens and user data
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Clean up PKCE data
      sessionStorage.removeItem('pkce_code_verifier');

      return data.user;
    } catch (error) {
      console.error('Callback handling failed:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<string> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token available');

    try {
      const response = await fetch(`${this.API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }

      return data.access_token;
    } catch (error) {
      // Refresh failed - clear tokens and redirect to login
      this.logout();
      throw error;
    }
  }

  /**
   * Logout user and revoke tokens
   */
  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');

    // Call backend logout endpoint to revoke tokens in Keycloak
    if (refreshToken) {
      try {
        await fetch(`${this.API_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch (error) {
        console.error('Logout API call failed:', error);
      }
    }

    // Clear local storage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('token'); // Legacy token

    // Redirect to home
    window.location.href = '/';
  }

  /**
   * Get current access token (with automatic refresh if expired)
   */
  async getAccessToken(): Promise<string | null> {
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    // Check if token is expired (basic check - decode JWT)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();

      // If token expires in less than 5 minutes, refresh it
      if (expiresAt - now < 5 * 60 * 1000) {
        return await this.refreshToken();
      }

      return token;
    } catch (error) {
      console.error('Token parsing failed:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token') && !!localStorage.getItem('user');
  }

  /**
   * Get current user from localStorage
   */
  getCurrentUser(): any | null {
    const userJson = localStorage.getItem('user');
    if (!userJson) return null;
    
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }
}

export const keycloakService = new KeycloakService();
