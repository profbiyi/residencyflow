# Frontend Keycloak OIDC Integration

This document explains the Keycloak OIDC authentication implementation in the ResidencyFlow frontend.

## Overview

The frontend now supports **dual authentication modes**:
1. **Keycloak OIDC** (Primary, Recommended) - Industry-standard OAuth2/OIDC flow
2. **Legacy Password Auth** (Fallback) - Direct email/password login via backend

Users can toggle between both methods on the login screen.

## Architecture

```
┌─────────────────┐
│  Landing Page   │
│                 │
│  [Login Button] │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  Auth Component │
│                 │
│ ┌─────────────┐ │
│ │ SSO Login   │ │ (Default)
│ │ (Keycloak)  │ │
│ └─────────────┘ │
│       OR        │
│ ┌─────────────┐ │
│ │ Email/Pass  │ │ (Legacy Fallback)
│ └─────────────┘ │
└────────┬────────┘
         │
         v (SSO Selected)
┌─────────────────┐
│    Keycloak     │
│  Login Screen   │
│                 │
│  [Username]     │
│  [Password]     │
│  [Sign In]      │
└────────┬────────┘
         │
         v (Authorization Code)
┌─────────────────┐
│ OAuth Callback  │
│   Component     │
│                 │
│ • Exchange code │
│ • Get tokens    │
│ • Store tokens  │
│ • Load user     │
└────────┬────────┘
         │
         v
┌─────────────────┐
│   Dashboard     │
└─────────────────┘
```

## Files Created/Modified

### New Files

1. **`src/services/keycloak.ts`** (224 lines)
   - KeycloakService class
   - PKCE implementation (code verifier + challenge)
   - OAuth2 authorization code flow
   - Token refresh logic
   - Logout with token revocation

2. **`src/components/OAuthCallback.tsx`** (127 lines)
   - Handles OAuth2 callback from Keycloak
   - Exchanges authorization code for tokens
   - Error handling with user-friendly messages
   - Auto-redirect after authentication

### Modified Files

1. **`src/components/Auth.tsx`**
   - Added Keycloak SSO login button
   - Toggle between SSO and legacy auth
   - Default to SSO (Keycloak) mode

2. **`src/services/api.ts`**
   - Updated to use `access_token` (Keycloak) or `token` (legacy)
   - Stores both access_token and refresh_token
   - Clears both tokens on 401 errors

3. **`src/App.tsx`**
   - Added OAuth callback route handler
   - Updated logout to use Keycloak logout API
   - Integrated keycloakService

## Authentication Flows

### 1. Keycloak OIDC Flow (Primary)

**Step-by-step**:

1. User clicks **"Sign in with SSO"** on login page
2. Frontend calls `keycloakService.login()`:
   - Generates PKCE code verifier (random 32 bytes)
   - Generates SHA-256 code challenge
   - Stores verifier in sessionStorage
   - Redirects to Keycloak: `/auth?client_id=...&code_challenge=...`
3. User enters credentials at Keycloak
4. Keycloak validates and redirects to: `/callback?code=abc123`
5. Frontend `OAuthCallback` component:
   - Extracts authorization code from URL
   - Calls backend: `POST /auth/callback { code }`
   - Backend exchanges code for tokens with Keycloak
   - Backend validates user exists in database
   - Returns: `{ access_token, refresh_token, user }`
6. Frontend stores tokens in localStorage:
   - `access_token` - JWT for API requests (1 hour)
   - `refresh_token` - For renewing access token (30 days)
   - `user` - User profile object
7. Redirect to dashboard

**Code Example**:
```typescript
// User clicks SSO button
await keycloakService.login();
// → Redirects to Keycloak

// After Keycloak redirects back to /callback
const user = await keycloakService.handleCallback(code);
// → Stores tokens, returns user
```

### 2. Legacy Password Flow (Fallback)

For users who prefer direct login or during migration:

1. User clicks **"Use email and password"**
2. Enter email/password
3. Frontend calls: `POST /auth/token` (legacy endpoint)
4. Backend validates credentials
5. Returns: `{ access_token, refresh_token, user }`
6. Frontend stores tokens
7. Redirect to dashboard

### 3. Token Refresh Flow

Access tokens expire after 1 hour. The frontend automatically refreshes them:

```typescript
// Before each API call, check token expiration
const token = await keycloakService.getAccessToken();
// → If token expires in < 5 minutes, auto-refresh

// Manual refresh
const newToken = await keycloakService.refreshToken();
// → Calls backend: POST /auth/refresh { refresh_token }
```

### 4. Logout Flow

```typescript
// User clicks logout
await keycloakService.logout();
// → Calls backend: POST /auth/logout { refresh_token }
// → Backend revokes tokens in Keycloak
// → Clears localStorage
// → Redirects to home page
```

## Security Features

### PKCE (Proof Key for Code Exchange)

Prevents authorization code interception attacks:

1. **Code Verifier**: Random 32-byte string (base64url encoded)
2. **Code Challenge**: SHA-256 hash of verifier (base64url encoded)
3. Verifier stored in sessionStorage (not sent to Keycloak)
4. Challenge sent in authorization request
5. Verifier sent when exchanging code for tokens
6. Keycloak validates: `SHA256(verifier) == challenge`

**Why?**: Even if an attacker intercepts the authorization code, they cannot exchange it for tokens without the verifier.

### Token Storage

- **Access Token**: Short-lived (1 hour), stored in localStorage
- **Refresh Token**: Long-lived (30 days), stored in localStorage
- **User Profile**: Stored in localStorage for quick access

**Note**: For production, consider using HttpOnly cookies for refresh tokens (requires backend changes).

### Automatic Token Refresh

Frontend checks token expiration before each API call:
- If expires in < 5 minutes → auto-refresh
- If refresh fails → logout user

### Error Handling

- Invalid authorization code → Show error, redirect to home
- Token exchange failure → Show error, redirect to home
- Token expired → Auto-refresh transparently
- Refresh token expired → Logout user, require re-login

## User Experience

### Login Page

```
┌─────────────────────────────┐
│   ResidencyFlow Logo        │
│                             │
│   Welcome Back              │
│                             │
│ ┌─────────────────────────┐ │
│ │  🛡️  Sign in with SSO   │ │  ← Primary (Keycloak)
│ └─────────────────────────┘ │
│            OR               │
│   Use email and password    │  ← Switch to legacy
└─────────────────────────────┘

        (Click toggle)
        
┌─────────────────────────────┐
│   Email Address             │
│ ┌─────────────────────────┐ │
│ │ name@company.com        │ │
│ └─────────────────────────┘ │
│                             │
│   Password                  │
│ ┌─────────────────────────┐ │
│ │ ••••••••                │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │      Log In             │ │
│ └─────────────────────────┘ │
│                             │
│   ← Back to SSO login       │
└─────────────────────────────┘
```

### OAuth Callback Page

```
┌─────────────────────────────┐
│   ResidencyFlow Logo        │
│                             │
│   Completing Sign In        │
│                             │
│   Please wait while we      │
│   verify your credentials...│
│                             │
│        [Spinner]            │
└─────────────────────────────┘
```

### Error State

```
┌─────────────────────────────┐
│   ResidencyFlow Logo        │
│                             │
│   Authentication Failed     │
│                             │
│ ┌─────────────────────────┐ │
│ │ ⚠️  Error               │ │
│ │                         │ │
│ │ Invalid authorization   │ │
│ │ code received           │ │
│ └─────────────────────────┘ │
│                             │
│   Redirecting to home...    │
└─────────────────────────────┘
```

## API Integration

### Authorization Header

All authenticated API requests include:

```typescript
Authorization: Bearer <access_token>
```

The `api.ts` service automatically adds this header:

```typescript
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + (
    localStorage.getItem('access_token') || 
    localStorage.getItem('token') ||  // Legacy fallback
    ''
  )
});
```

### 401 Handling

If any API call returns 401 (Unauthorized):
1. Clear all tokens from localStorage
2. Redirect to home page
3. User must re-login

## Environment Variables

Frontend requires:

```bash
# .env or .env.local
VITE_API_URL=http://localhost:8000  # Development
VITE_API_URL=https://api.yourdomain.com  # Production
```

The Keycloak configuration is fetched from backend:
```
GET /auth/config
→ { keycloak_url, realm, client_id, auth_endpoint, token_endpoint }
```

## Testing

### Local Development

1. **Start Keycloak**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d keycloak postgres
   ```

2. **Configure Keycloak**:
   - Import realm: `keycloak/residencyflow-realm.json`
   - Create test user (see `KEYCLOAK_SETUP.md`)

3. **Start Backend**:
   ```bash
   cd backend
   python -m uvicorn main:app --reload
   ```

4. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

5. **Test SSO Login**:
   - Navigate to `http://localhost:3000`
   - Click "Login"
   - Click "Sign in with SSO"
   - Should redirect to Keycloak at `http://localhost:8080`
   - Enter credentials
   - Should redirect back to `http://localhost:3000/callback`
   - Should auto-redirect to dashboard

6. **Test Legacy Login**:
   - Click "Use email and password"
   - Enter credentials
   - Should login without Keycloak redirect

### Production Testing

1. Update `.env.prod` with production domains
2. Ensure Keycloak redirect URIs include production domain
3. Test full flow with HTTPS
4. Verify token refresh works
5. Test logout and re-login

## Troubleshooting

### "Invalid redirect URI"

**Problem**: Keycloak rejects the callback redirect.

**Solution**:
1. Check Keycloak client settings
2. Ensure `http://localhost:3000/*` (dev) or `https://yourdomain.com/*` (prod) is in redirect URIs
3. Ensure trailing `/*` is included

### "Failed to initialize Keycloak config"

**Problem**: Cannot fetch `/auth/config` from backend.

**Solution**:
1. Verify backend is running
2. Check `VITE_API_URL` environment variable
3. Check CORS settings in backend

### "No authorization code received"

**Problem**: Callback URL missing `?code=...` parameter.

**Solution**:
1. Check Keycloak client has Standard Flow enabled
2. Verify redirect URI matches exactly
3. Check browser console for errors

### "Token validation failed"

**Problem**: Backend rejects the access token.

**Solution**:
1. Verify backend `KEYCLOAK_URL` matches token issuer
2. Check token hasn't expired (inspect JWT payload)
3. Ensure backend can reach Keycloak to fetch public keys

### User stuck on callback page

**Problem**: OAuthCallback component doesn't redirect.

**Solution**:
1. Check browser console for errors
2. Verify `/auth/callback` endpoint is accessible
3. Check network tab for failed API calls
4. Ensure user exists in Postgres database

## Migration Strategy

### Phase 1: Dual Auth (Current)
- Both SSO and legacy login available
- Default to SSO
- Legacy login as fallback
- **Status**: ✅ Implemented

### Phase 2: SSO Preference
- Encourage users to migrate to SSO
- Show banner: "Switch to SSO for better security"
- Legacy login still available
- **Timeline**: After Phase 4 testing

### Phase 3: SSO Only
- Remove legacy login option
- All authentication via Keycloak
- Deprecate `POST /auth/token` endpoint
- **Timeline**: After 90% user migration

## Code Examples

### Check if user is authenticated

```typescript
import { keycloakService } from './services/keycloak';

if (keycloakService.isAuthenticated()) {
  const user = keycloakService.getCurrentUser();
  console.log('Logged in as:', user.email);
}
```

### Make authenticated API call

```typescript
import { api } from './services/api';

// API service automatically adds Authorization header
const pipelines = await api.pipelines.list();
```

### Manual token refresh

```typescript
import { keycloakService } from './services/keycloak';

try {
  const newToken = await keycloakService.refreshToken();
  console.log('Token refreshed:', newToken);
} catch (error) {
  console.error('Refresh failed, user logged out');
}
```

### Logout user

```typescript
import { keycloakService } from './services/keycloak';

await keycloakService.logout();
// User will be redirected to home page
```

## Best Practices

1. **Always use HTTPS in production** - OAuth2 requires secure connections
2. **Don't store tokens in cookies** (unless HttpOnly) - Vulnerable to XSS
3. **Auto-refresh tokens** before expiration - Better UX
4. **Logout on 401 errors** - Don't retry with expired tokens
5. **Show loading states** - OAuth redirects take time
6. **Handle errors gracefully** - Clear messages for users
7. **Log authentication events** - For debugging and security audits
8. **Test token expiration** - Ensure refresh works correctly
9. **Monitor Keycloak** - Check for failed login attempts
10. **Use PKCE** - Prevents code interception attacks

## Performance Considerations

- **Token caching**: Access tokens cached in localStorage (no API call needed)
- **Auto-refresh**: Proactive refresh reduces API failures
- **Lazy loading**: Keycloak config fetched only when needed
- **Session storage**: PKCE verifier in sessionStorage (clears on tab close)
- **Single redirect**: One OAuth flow per login session

## Security Checklist

- [x] PKCE implementation (code challenge + verifier)
- [x] Token expiration checking
- [x] Automatic token refresh
- [x] Secure token storage (localStorage)
- [x] Logout with token revocation
- [x] 401 error handling with auto-logout
- [x] HTTPS enforcement (production)
- [x] CORS validation
- [x] No sensitive data in URL parameters
- [x] Clear error messages (no token leakage)

## Next Steps

1. **Test frontend integration** with Keycloak
2. **Update documentation** with screenshots
3. **Add monitoring** for auth failures
4. **Consider HttpOnly cookies** for refresh tokens (backend change required)
5. **Add MFA support** (Keycloak built-in)
6. **Social login** (Google, GitHub) via Keycloak
7. **Passwordless auth** (WebAuthn) via Keycloak

## Support

For frontend authentication issues:
- Check browser console for errors
- Review network tab for failed API calls
- Check `localStorage` for token presence
- Verify backend `/auth/config` endpoint is accessible
- Review this guide's troubleshooting section

For Keycloak configuration issues:
- See `KEYCLOAK_SETUP.md`
- Check Keycloak admin console logs
- Verify realm and client settings
