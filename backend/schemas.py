# backend/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime

# --- AUTH SCHEMAS ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_id: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    organization_id: Optional[str]
    
    class Config:
        from_attributes = True

# --- ORGANIZATION SCHEMAS ---
class OrgCreate(BaseModel):
    name: str
    admin_email: EmailStr
    admin_name: str
    password: str
    plan: str = "Starter"  # Starter, Pro, Enterprise

class PlanUpdate(BaseModel):
    plan: str

# --- CONNECTOR SCHEMAS ---
class ConnectorCreate(BaseModel):
    name: str
    type_id: str
    connector_type: str  # source or destination
    configuration: Dict[str, Any]
    region: Optional[str] = None

class ConnectorResponse(BaseModel):
    id: str
    name: str
    type_id: str
    connector_type: str
    status: str
    organization_id: str
    
    class Config:
        from_attributes = True

# --- PIPELINE SCHEMAS ---
class PipelineCreate(BaseModel):
    name: str
    source_id: str
    destination_id: str
    sync_mode: str  # full_load, incremental_append, incremental_merge
    frequency: str  # manual, hourly, daily, weekly, realtime
    schema_policy: str = "evolve"
    notification_config: Optional[Dict[str, Any]] = None
    transformation_config: Optional[Dict[str, Any]] = None

class PipelineResponse(BaseModel):
    id: str
    name: str
    source_id: str
    destination_id: str
    status: str
    organization_id: str
    
    class Config:
        from_attributes = True

# --- TEAM INVITATION SCHEMAS ---
class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str  # Owner, Admin, Viewer

class InvitationResponse(BaseModel):
    id: str
    email: str
    role: str
    status: str
    created_at: datetime
    expires_at: datetime
    
    class Config:
        from_attributes = True

class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    full_name: str
