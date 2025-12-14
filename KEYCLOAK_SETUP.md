# Keycloak OIDC Setup Guide

This guide covers the complete setup of Keycloak for ResidencyFlow's invite-only, multi-tenant authentication.

## Overview

ResidencyFlow uses Keycloak for:
- **OIDC/OAuth2 authentication** - Industry-standard protocol
- **Invite-only onboarding** - Super admins create organizations & invite users
- **Role-based access control** - `super_admin`, `owner`, `admin`, `user`, `viewer`
- **Multi-tenancy** - Users belong to organizations, isolated by `organization_id`
- **Token-based auth** - JWT tokens with RS256 signature

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  Frontend   │────────▶│   Keycloak   │◀────────│  FastAPI API │
│ (React SPA) │  OIDC   │ (Auth Server)│  Admin  │  (Backend)   │
└─────────────┘         └──────────────┘   API   └──────────────┘
      │                         │                         │
      │                         │                         │
      └─────────────────────────┴─────────────────────────┘
                         PostgreSQL DB
              (Stores users + organization mapping)
```

## 1. Initial Keycloak Setup

### Import Realm Configuration

1. Start Keycloak (via `docker-compose.prod.yml`):
   ```bash
   docker-compose -f docker-compose.prod.yml up -d keycloak
   ```

2. Access Keycloak Admin Console:
   - URL: `https://auth.yourdomain.com` (production) or `http://localhost:8080` (local)
   - Username: `admin` (from `KEYCLOAK_ADMIN_USER`)
   - Password: From `KEYCLOAK_ADMIN_PASSWORD`

3. Import realm configuration:
   - Click **"Add realm"** → **"Select file"**
   - Choose `keycloak/residencyflow-realm.json`
   - Click **"Create"**

### Manual Realm Creation (Alternative)

If not importing JSON:

1. **Create Realm**:
   - Name: `residencyflow`
   - Display name: `ResidencyFlow`
   - Enabled: `ON`

2. **Configure Realm Settings**:
   - Login tab:
     - User registration: `OFF` (invite-only)
     - Forgot password: `ON`
     - Remember me: `ON`
     - Email as username: `ON`
   
   - Security tab:
     - Brute force detection: `ON`
     - Max login failures: `5`
     - Wait increment: `60 seconds`

3. **Create Roles**:
   - Realm Roles → Add Role:
     - `super_admin` - Platform administrator
     - `owner` - Organization owner
     - `admin` - Organization admin
     - `user` - Regular user
     - `viewer` - Read-only access

## 2. Client Configuration

### API Client (Confidential)

Used by FastAPI backend for token validation and user creation.

1. **Create Client**:
   - Client ID: `residencyflow-api`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`

2. **Settings**:
   - Standard Flow Enabled: `ON`
   - Direct Access Grants: `ON` (for development/testing)
   - Service Accounts Enabled: `ON` (for admin operations)
   - Valid Redirect URIs:
     ```
     http://localhost:8000/*
     http://localhost:3000/*
     https://api.yourdomain.com/*
     https://yourdomain.com/*
     ```
   - Web Origins:
     ```
     http://localhost:3000
     https://yourdomain.com
     ```

3. **Get Client Secret**:
   - Go to **Credentials** tab
   - Copy the **Secret**
   - Add to `.env.prod` as `KEYCLOAK_CLIENT_SECRET`

4. **Configure Mappers** (add custom claims):
   - Mappers tab → Create:
   
   **Organization ID Mapper**:
   - Name: `organization_id`
   - Mapper Type: `User Attribute`
   - User Attribute: `organization_id`
   - Token Claim Name: `organization_id`
   - Claim JSON Type: `String`
   - Add to ID token: `ON`
   - Add to access token: `ON`
   - Add to userinfo: `ON`
   
   **Role Mapper**:
   - Name: `role`
   - Mapper Type: `User Attribute`
   - User Attribute: `role`
   - Token Claim Name: `role`
   - Claim JSON Type: `String`
   - Add to ID token: `ON`
   - Add to access token: `ON`
   - Add to userinfo: `ON`

### Frontend Client (Public)

Used by React SPA for user login flow.

1. **Create Client**:
   - Client ID: `residencyflow-frontend`
   - Client Protocol: `openid-connect`
   - Access Type: `public`

2. **Settings**:
   - Standard Flow Enabled: `ON`
   - Direct Access Grants: `OFF` (security best practice for SPAs)
   - Valid Redirect URIs:
     ```
     http://localhost:3000/*
     https://yourdomain.com/*
     ```
   - Web Origins:
     ```
     http://localhost:3000
     https://yourdomain.com
     ```

## 3. Admin CLI Client (For Backend User Creation)

For the FastAPI backend to create users via Admin API:

1. **Enable Service Account**:
   - Use existing `residencyflow-api` client
   - Already has "Service Accounts Enabled: ON"

2. **Assign Admin Roles**:
   - Go to `residencyflow-api` client → **Service Account Roles** tab
   - Client Roles → Select `realm-management`
   - Assign these roles:
     - `manage-users`
     - `view-users`
     - `query-users`

## 4. SMTP Configuration (Email Invitations)

1. **Configure Email**:
   - Realm Settings → Email tab:
     - Host: `smtp.example.com` (e.g., SendGrid, AWS SES, Gmail)
     - Port: `587` (TLS) or `465` (SSL)
     - From: `noreply@yourdomain.com`
     - From Display Name: `ResidencyFlow`
     - Enable Authentication: `ON`
     - Username: Your SMTP username
     - Password: Your SMTP password

2. **Test Email**:
   - Users → View user → Required Actions → Add "Verify Email"
   - Send test email

## 5. Environment Variables

Update your `.env.prod` with:

```bash
# Keycloak Admin (for container)
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=your_secure_admin_password
KEYCLOAK_HOSTNAME=auth.yourdomain.com

# Keycloak OIDC (for API)
KEYCLOAK_URL=https://auth.yourdomain.com
KEYCLOAK_REALM=residencyflow
KEYCLOAK_CLIENT_ID=residencyflow-api
KEYCLOAK_CLIENT_SECRET=your_client_secret_from_keycloak
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli
KEYCLOAK_ADMIN_CLIENT_SECRET=optional_if_using_service_account
```

## 6. Authentication Flow

### User Login (Authorization Code Flow)

1. **Frontend initiates login**:
   ```javascript
   GET /auth/config  // Get Keycloak endpoints
   
   // Redirect user to Keycloak
   https://auth.yourdomain.com/realms/residencyflow/protocol/openid-connect/auth
     ?client_id=residencyflow-frontend
     &redirect_uri=http://localhost:3000/callback
     &response_type=code
     &scope=openid email profile
   ```

2. **User logs in at Keycloak** (username/password)

3. **Keycloak redirects back with code**:
   ```
   http://localhost:3000/callback?code=abc123...
   ```

4. **Frontend exchanges code for tokens**:
   ```javascript
   POST /auth/callback
   Body: { "code": "abc123..." }
   
   Response:
   {
     "access_token": "eyJhbGc...",
     "refresh_token": "eyJhbGc...",
     "token_type": "bearer",
     "user": { ... }
   }
   ```

5. **Frontend stores tokens** and includes `Authorization: Bearer <token>` in API requests

### Token Refresh

```javascript
POST /auth/refresh
Body: { "refresh_token": "eyJhbGc..." }

Response:
{
  "access_token": "new_eyJhbGc...",
  "refresh_token": "new_refresh_token...",
  "token_type": "bearer"
}
```

### Logout

```javascript
POST /auth/logout
Body: { "refresh_token": "eyJhbGc..." }

Response: { "message": "Logged out successfully" }
```

## 7. Invite-Only User Creation

### Super Admin Creates Organization

```javascript
POST /admin/organizations
Headers: { Authorization: Bearer <super_admin_token> }
Body:
{
  "name": "Acme Corp",
  "admin_email": "admin@acme.com",
  "admin_name": "John Doe",
  "password": "temporary_password_123",
  "plan": "Starter"
}
```

Backend flow:
1. Creates organization in Postgres
2. Creates user in Keycloak via Admin API:
   - Sets `organization_id` attribute
   - Assigns `owner` role
3. Creates user record in Postgres
4. User receives email with temporary password

### Team Member Invitation

1. **Owner/Admin sends invite**:
   ```javascript
   POST /team/invite
   Headers: { Authorization: Bearer <owner_token> }
   Body:
   {
     "email": "member@acme.com",
     "role": "user"
   }
   ```

2. **Backend creates invitation** with unique token

3. **User accepts invite**:
   ```javascript
   POST /auth/accept-invite
   Body:
   {
     "token": "invitation_token_here",
     "full_name": "Jane Smith",
     "password": "secure_password_456"
   }
   ```

4. **Backend creates user in Keycloak** with:
   - Email from invitation
   - Password from user
   - Role from invitation
   - `organization_id` from invitation

5. **User can now log in** via Keycloak

## 8. Role-Based Access Control

### Token Structure

Keycloak issues JWT tokens with claims:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "organization_id": "org-uuid-123",
  "role": "owner",
  "realm_access": {
    "roles": ["owner", "user"]
  },
  "exp": 1234567890
}
```

### Endpoint Protection

```python
# Require any authenticated user
@app.get("/pipelines")
def get_pipelines(current_user: dict = Depends(get_current_user_keycloak)):
    # current_user = { "sub": "...", "email": "...", "organization_id": "...", "role": "..." }
    pass

# Require super admin
@app.get("/admin/organizations")
def list_orgs(current_user: dict = Depends(require_super_admin)):
    # Only users with "super_admin" role can access
    pass

# Require org admin (owner or admin)
@app.post("/team/invite")
def invite_member(current_user: dict = Depends(require_org_admin)):
    # Only "owner" or "admin" roles can access
    pass
```

## 9. Testing

### Local Development

1. Start Keycloak:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d keycloak postgres
   ```

2. Access Keycloak at `http://localhost:8080`

3. Import realm configuration

4. Update `.env` with local settings:
   ```bash
   KEYCLOAK_URL=http://localhost:8080
   KEYCLOAK_REALM=residencyflow
   KEYCLOAK_CLIENT_ID=residencyflow-api
   ```

5. Test endpoints:
   ```bash
   # Get auth config
   curl http://localhost:8000/auth/config
   
   # Create test user via admin API
   # (requires super admin token or service account)
   ```

### Create Initial Super Admin

Manually create first super admin user in Keycloak:

1. Keycloak Admin Console → Users → Add User
2. Username: `admin@residencyflow.com`
3. Email: `admin@residencyflow.com`
4. Email Verified: `ON`
5. Save

6. Credentials tab:
   - Set Password: `your_admin_password`
   - Temporary: `OFF`

7. Attributes tab:
   - Add attribute: `organization_id` = `null` (or leave empty)
   - Add attribute: `role` = `super_admin`

8. Role Mappings tab:
   - Assign realm role: `super_admin`

9. Test login via frontend

## 10. Production Checklist

- [ ] Change all default passwords in `.env.prod`
- [ ] Configure valid SSL certificates (Caddy handles this)
- [ ] Set correct redirect URIs for production domain
- [ ] Configure SMTP for email invitations
- [ ] Enable Keycloak brute force protection
- [ ] Set up Keycloak database backup
- [ ] Configure session timeouts appropriately:
  - Access token: 1 hour
  - SSO session idle: 24 hours
  - SSO session max: 7 days
- [ ] Create initial super admin user
- [ ] Test full authentication flow
- [ ] Test token refresh flow
- [ ] Test logout and token revocation
- [ ] Test invite-only user creation

## 11. Troubleshooting

### "Invalid redirect URI"
- Check client settings in Keycloak
- Ensure redirect URI matches exactly (including trailing `/*`)

### "Invalid token"
- Verify `KEYCLOAK_URL` matches Keycloak's issuer
- Check token hasn't expired
- Ensure token signature validation is correct (RS256)

### "User not found after login"
- User exists in Keycloak but not in Postgres
- Ensure user was created via invite flow or admin API

### "Failed to create user in Keycloak"
- Check service account roles (`manage-users`)
- Verify `KEYCLOAK_CLIENT_SECRET` is correct
- Check Keycloak logs: `docker logs keycloak`

### Email not sending
- Verify SMTP configuration in Realm Settings → Email
- Test with "Test connection" button
- Check Keycloak logs for SMTP errors

## 12. Security Best Practices

1. **Never store client secrets in frontend code** - only use public client
2. **Use HTTPS in production** - Keycloak enforces this
3. **Short-lived access tokens** (1 hour) with refresh tokens (30 days)
4. **Rotate client secrets** periodically
5. **Enable brute force protection** in Keycloak
6. **Audit login events** via Keycloak events
7. **Use strong passwords** for admin accounts
8. **Limit redirect URIs** to known domains only
9. **Validate tokens on every API request** - don't trust client
10. **Revoke tokens on logout** - call `/auth/logout` endpoint

## Support

For issues with Keycloak integration:
- Check Keycloak docs: https://www.keycloak.org/documentation
- Check FastAPI logs: `docker logs api`
- Check Keycloak logs: `docker logs keycloak`
- Review this guide's troubleshooting section
