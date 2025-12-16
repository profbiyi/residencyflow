# backend/keycloak_auth.py - Keycloak OIDC Authentication
import os
import httpx
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status, Header
from jose import jwt, JWTError
from datetime import datetime
import json

# Keycloak Configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "residencyflow")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "residencyflow-api")
KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET", "")

# OIDC endpoints
OIDC_DISCOVERY_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/.well-known/openid-configuration"
TOKEN_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
USERINFO_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo"
JWKS_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
LOGOUT_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/logout"


class KeycloakAuth:
    """
    Keycloak OIDC Authentication Handler.
    Replaces custom JWT implementation with proper OAuth2/OIDC.
    """
    
    def __init__(self):
        self.public_key_cache: Optional[str] = None
        self.cache_timestamp: Optional[datetime] = None
    
    async def get_public_key(self) -> Optional[str]:
        """
        Fetch Keycloak's public key for JWT verification.
        Cached for 1 hour to avoid excessive requests.
        Returns None if Keycloak is not available.
        """
        # Check cache (1 hour TTL)
        if self.public_key_cache and self.cache_timestamp:
            elapsed = (datetime.utcnow() - self.cache_timestamp).total_seconds()
            if elapsed < 3600:  # 1 hour
                return self.public_key_cache
        
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(JWKS_URL)
                response.raise_for_status()
                jwks = response.json()
                
                # Get first key (Keycloak typically uses RS256)
                if jwks.get("keys"):
                    key = jwks["keys"][0]
                    # Convert JWK to PEM format
                    from jose.backends import RSAKey
                    rsa_key = RSAKey(key, algorithm='RS256')
                    public_key = rsa_key.to_pem().decode('utf-8')
                    
                    # Cache it
                    self.public_key_cache = public_key
                    self.cache_timestamp = datetime.utcnow()
                    
                    return public_key
                
                return None
        except Exception as e:
            # Keycloak not available - fallback to legacy auth
            print(f"⚠️  Keycloak unavailable: {e}. Using legacy auth.")
            return None
    
    async def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify Keycloak JWT token and extract claims.
        Returns None if Keycloak is not available.
        
        Returns:
            Dict with user claims (sub, email, roles, etc.) or None
        """
        try:
            public_key = await self.get_public_key()
            
            if not public_key:
                # Keycloak not available
                return None
            
            # Decode and verify token
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=KEYCLOAK_CLIENT_ID,
                options={
                    "verify_signature": True,
                    "verify_aud": True,
                    "verify_exp": True
                }
            )
            
            return payload
        
        except Exception as e:
            # Token invalid or Keycloak unavailable
            return None
    
    async def exchange_code_for_token(
        self,
        code: str,
        redirect_uri: str
    ) -> Dict[str, Any]:
        """
        Exchange authorization code for access token (OAuth2 flow).
        Used by frontend after user logs in via Keycloak.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": KEYCLOAK_CLIENT_ID,
                    "client_secret": KEYCLOAK_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange authorization code"
                )
            
            return response.json()
    
    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh access token using refresh token.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": KEYCLOAK_CLIENT_ID,
                    "client_secret": KEYCLOAK_CLIENT_SECRET,
                    "refresh_token": refresh_token
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired refresh token"
                )
            
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Get user information from Keycloak UserInfo endpoint.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Failed to get user info"
                )
            
            return response.json()
    
    async def logout(self, refresh_token: str) -> bool:
        """
        Logout user by revoking refresh token in Keycloak.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                LOGOUT_URL,
                data={
                    "client_id": KEYCLOAK_CLIENT_ID,
                    "client_secret": KEYCLOAK_CLIENT_SECRET,
                    "refresh_token": refresh_token
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            return response.status_code == 204
    
    async def create_user(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        organization_id: str,
        role: str = "user"
    ) -> Dict[str, Any]:
        """
        Create user in Keycloak (for invite-only onboarding).
        Requires admin token.
        """
        # Get admin token
        admin_token = await self._get_admin_token()
        
        user_data = {
            "username": email,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": True,
            "emailVerified": True,
            "credentials": [{
                "type": "password",
                "value": password,
                "temporary": False
            }],
            "attributes": {
                "organization_id": [organization_id],
                "role": [role]
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{KEYCLOAK_URL}/admin/realms/{KEYCLOAK_REALM}/users",
                json=user_data,
                headers={
                    "Authorization": f"Bearer {admin_token}",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 201:
                # Get user ID from Location header
                location = response.headers.get("Location")
                user_id = location.split("/")[-1] if location else None
                return {"user_id": user_id, "status": "created"}
            else:
                raise HTTPException(
                    status_code=response.status_code,
                    detail="Failed to create user in Keycloak"
                )
    
    async def _get_admin_token(self) -> str:
        """
        Get admin token for Keycloak Admin API.
        Uses client credentials flow.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": KEYCLOAK_CLIENT_ID,
                    "client_secret": KEYCLOAK_CLIENT_SECRET
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to get admin token"
                )
            
            return response.json()["access_token"]
    
    def extract_roles(self, token_payload: Dict[str, Any]) -> list[str]:
        """
        Extract roles from Keycloak token.
        Roles are in: realm_access.roles or resource_access.{client_id}.roles
        """
        roles = []
        
        # Realm roles
        if "realm_access" in token_payload:
            roles.extend(token_payload["realm_access"].get("roles", []))
        
        # Client roles
        if "resource_access" in token_payload:
            client_access = token_payload["resource_access"].get(KEYCLOAK_CLIENT_ID, {})
            roles.extend(client_access.get("roles", []))
        
        return roles
    
    def is_super_admin(self, roles: list[str]) -> bool:
        """Check if user has super_admin role"""
        return "super_admin" in roles or "admin" in roles
    
    def is_org_admin(self, roles: list[str]) -> bool:
        """Check if user has org admin role"""
        return "org_admin" in roles or "owner" in roles


# Singleton instance
keycloak_auth = KeycloakAuth()


# Helper function to extract Bearer token
def get_bearer_token(authorization: str = Header(None)) -> str:
    """Extract Bearer token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    return authorization.split(" ", 1)[1].strip()


# FastAPI Dependency
async def get_current_user_keycloak(
    token: str = Depends(get_bearer_token)
):
    """
    FastAPI dependency to get current user from Keycloak token.
    Requires valid Bearer token - no fallback.
    """
    payload = await keycloak_auth.verify_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    return {
        "id": payload.get("sub"),  # Keycloak user ID
        "sub": payload.get("sub"),  # Add sub for consistency
        "email": payload.get("email"),
        "name": payload.get("name"),
        "organization_id": payload.get("organization_id"),  # Custom attribute
        "role": keycloak_auth.extract_roles(payload)[0] if keycloak_auth.extract_roles(payload) else None,
        "roles": keycloak_auth.extract_roles(payload),
        "token_payload": payload
    }


async def require_super_admin(current_user: dict = Depends(get_current_user_keycloak)):
    """
    FastAPI dependency to require super admin role.
    """
    if not keycloak_auth.is_super_admin(current_user["roles"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super admin privileges required"
        )
    return current_user


async def require_org_admin(current_user: dict = Depends(get_current_user_keycloak)):
    """
    FastAPI dependency to require organization admin role.
    """
    if not keycloak_auth.is_org_admin(current_user["roles"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin privileges required"
        )
    return current_user
