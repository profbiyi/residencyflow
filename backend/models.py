# backend/models.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    slug = Column(String, unique=True, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="Active")
    plan = Column(String, default="Starter") # Starter, Pro, Enterprise
    owner_email = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    role = Column(String, default="Owner") # Owner, Admin, Viewer, SuperAdmin
    is_active = Column(Boolean, default=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True)

class Connector(Base):
    __tablename__ = "connectors"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    type_id = Column(String)
    connector_type = Column(String) 
    configuration = Column(JSON) 
    status = Column(String, default="active")
    organization_id = Column(String, ForeignKey("organizations.id"))
    created_by = Column(String, ForeignKey("users.id"))

class Pipeline(Base):
    __tablename__ = "pipelines"
    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    source_id = Column(String, ForeignKey("connectors.id"))
    destination_id = Column(String, ForeignKey("connectors.id"))
    sync_mode = Column(String)
    frequency = Column(String)
    status = Column(String, default="IDLE")
    last_run = Column(DateTime)
    rows_processed = Column(Integer, default=0)
    organization_id = Column(String, ForeignKey("organizations.id"))
    created_by = Column(String, ForeignKey("users.id"))
    schema_policy = Column(String, default="evolve")
    notification_config = Column(JSON, nullable=True)
    transformation_config = Column(JSON, nullable=True)

class TeamInvitation(Base):
    __tablename__ = "team_invitations"
    id = Column(String, primary_key=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"))
    email = Column(String)
    role = Column(String)  # Owner, Admin, Viewer
    invited_by = Column(String, ForeignKey("users.id"))
    token = Column(String, unique=True, index=True)
    status = Column(String, default="Pending")  # Pending, Accepted, Expired, Revoked
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime)
    accepted_at = Column(DateTime, nullable=True)
