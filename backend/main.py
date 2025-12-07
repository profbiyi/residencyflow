# backend/main.py
from fastapi import FastAPI, Depends, HTTPException, status, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models, schemas
import uuid
import jwt # PyJWT
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os

# SECURITY CONFIG
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_key_change_me")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="ResidencyFlow API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AUTH UTILS ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)  # 15 min default
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)  # 30 days for refresh
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None: raise HTTPException(status_code=401)
    except:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None: raise HTTPException(status_code=401)
    return user

def get_super_admin(user: models.User = Depends(get_current_user)):
    if user.role != "SuperAdmin":
        raise HTTPException(status_code=403, detail="Super Admin privileges required")
    return user

# --- AUTH ENDPOINTS ---
@app.post("/auth/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = create_access_token(data={"sub": user.email})
    refresh_token = create_refresh_token(data={"sub": user.email})
    
    # Format user object for frontend compatibility
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "companyName": user.full_name,  # Using full_name as companyName for now
        "organizationId": user.organization_id,
        "role": user.role
    }
    
    return {
        "access_token": access_token, 
        "refresh_token": refresh_token,
        "token_type": "bearer", 
        "user": user_data
    }

@app.post("/auth/refresh")
def refresh_token(refresh_token: str = Body(..., embed=True), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401)
            
        user = db.query(models.User).filter(models.User.email == email).first()
        if user is None:
            raise HTTPException(status_code=401)
            
        new_access_token = create_access_token(data={"sub": user.email})
        return {"access_token": new_access_token, "token_type": "bearer"}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@app.post("/auth/register")
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # This is for public registration (if enabled)
    # Use Admin endpoint for onboarded tenants
    pass

@app.get("/")
def read_root():
    return {"message": "ResidencyFlow API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# --- SUPER ADMIN ENDPOINTS (The "Agba" Features) ---
@app.get("/admin/organizations")
def list_orgs(current_user: models.User = Depends(get_super_admin), db: Session = Depends(get_db)):
    return db.query(models.Organization).all()

@app.post("/admin/organizations")
def onboard_tenant(org_data: schemas.OrgCreate, current_user: models.User = Depends(get_super_admin), db: Session = Depends(get_db)):
    # 1. Check existing
    if db.query(models.User).filter(models.User.email == org_data.admin_email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # 2. Create Org
    new_org = models.Organization(
        id=str(uuid.uuid4()),
        name=org_data.name,
        slug=org_data.name.lower().replace(" ", "-"),
        status="Active",
        plan=org_data.plan,
        owner_email=org_data.admin_email
    )
    db.add(new_org)
    
    # 3. Create Admin User
    new_user = models.User(
        id=str(uuid.uuid4()),
        email=org_data.admin_email,
        full_name=org_data.admin_name,
        hashed_password=get_password_hash(org_data.password),
        role="Owner",
        organization_id=new_org.id
    )
    db.add(new_user)
    db.commit()
    return new_org

@app.patch("/admin/organizations/{org_id}/plan")
def update_plan(org_id: str, plan_data: schemas.PlanUpdate, current_user: models.User = Depends(get_super_admin), db: Session = Depends(get_db)):
    org = db.query(models.Organization).filter(models.Organization.id == org_id).first()
    if not org: raise HTTPException(status_code=404)
    org.plan = plan_data.plan
    db.commit()
    return {"status": "success"}

# --- PIPELINE ENDPOINTS ---
@app.get("/pipelines")
def get_pipelines(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Pipeline).filter(models.Pipeline.organization_id == current_user.organization_id).all()

@app.post("/pipelines")
def create_pipeline(pipeline: schemas.PipelineCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_p = models.Pipeline(
        id=str(uuid.uuid4()),
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        **pipeline.dict()
    )
    db.add(new_p)
    db.commit()
    return new_p

@app.post("/pipelines/{id}/run")
def run_pipeline(id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Pipeline).filter(models.Pipeline.id == id).first()
    if not p or p.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404)
    
    p.status = "RUNNING"
    db.commit()
    # In real world, send message to Redis/Celery/RabbitMQ here
    return {"status": "queued"}

@app.get("/connectors")
def get_connectors(type: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Connector).filter(
        models.Connector.organization_id == current_user.organization_id,
        models.Connector.connector_type == type
    ).all()

@app.post("/connectors")
def create_connector(conn: schemas.ConnectorCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_c = models.Connector(
        id=str(uuid.uuid4()),
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        **conn.dict()
    )
    db.add(new_c)
    db.commit()
    return new_c

@app.post("/connectors/test")
def test_connection(data: dict):
    # Simulate valid configuration
    return {"success": True, "message": "Connection verified via Python Backend"}

# --- TEAM MANAGEMENT ENDPOINTS ---
import secrets

@app.post("/team/invite")
def invite_team_member(invite: schemas.InviteUserRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check permissions (Owner/Admin only)
    if current_user.role not in ["Owner", "Admin", "SuperAdmin"]:
        raise HTTPException(status_code=403, detail="Only Owner/Admin can invite")
    
    # Check for existing user
    existing = db.query(models.User).filter(
        models.User.email == invite.email,
        models.User.organization_id == current_user.organization_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already in organization")
    
    # Check for pending invite
    pending = db.query(models.TeamInvitation).filter(
        models.TeamInvitation.email == invite.email,
        models.TeamInvitation.organization_id == current_user.organization_id,
        models.TeamInvitation.status == "Pending"
    ).first()
    if pending:
        raise HTTPException(status_code=400, detail="Invitation already sent")
    
    # Create invitation
    token = secrets.token_urlsafe(32)
    invitation = models.TeamInvitation(
        id=str(uuid.uuid4()),
        organization_id=current_user.organization_id,
        email=invite.email,
        role=invite.role,
        invited_by=current_user.id,
        token=token,
        status="Pending",
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(invitation)
    db.commit()
    
    # TODO: Send email with invitation link
    # send_invitation_email(invite.email, token, org.name)
    
    return {"message": "Invitation sent", "id": invitation.id, "token": token}

@app.get("/team/invitations")
def list_invitations(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    invitations = db.query(models.TeamInvitation).filter(
        models.TeamInvitation.organization_id == current_user.organization_id
    ).all()
    return invitations

@app.delete("/team/invitations/{invitation_id}")
def cancel_invitation(invitation_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    invitation = db.query(models.TeamInvitation).filter(
        models.TeamInvitation.id == invitation_id,
        models.TeamInvitation.organization_id == current_user.organization_id
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    invitation.status = "Revoked"
    db.commit()
    return {"message": "Invitation cancelled"}

@app.get("/auth/validate-invite")
def validate_invite(token: str, db: Session = Depends(get_db)):
    invitation = db.query(models.TeamInvitation).filter(
        models.TeamInvitation.token == token,
        models.TeamInvitation.status == "Pending"
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid invitation")
    
    if invitation.expires_at < datetime.utcnow():
        invitation.status = "Expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Invitation expired")
    
    org = db.query(models.Organization).filter(models.Organization.id == invitation.organization_id).first()
    return {
        "email": invitation.email,
        "role": invitation.role,
        "organization_name": org.name if org else "Unknown"
    }

@app.post("/auth/accept-invite")
def accept_invite(data: schemas.AcceptInviteRequest, db: Session = Depends(get_db)):
    invitation = db.query(models.TeamInvitation).filter(
        models.TeamInvitation.token == data.token,
        models.TeamInvitation.status == "Pending"
    ).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid invitation")
    
    if invitation.expires_at < datetime.utcnow():
        invitation.status = "Expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Invitation expired")
    
    # Check if user already exists
    existing = db.query(models.User).filter(models.User.email == invitation.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Create user
    new_user = models.User(
        id=str(uuid.uuid4()),
        email=invitation.email,
        full_name=data.full_name,
        hashed_password=get_password_hash(data.password),
        role=invitation.role,
        organization_id=invitation.organization_id,
        is_active=True
    )
    db.add(new_user)
    
    # Mark invitation as accepted
    invitation.status = "Accepted"
    invitation.accepted_at = datetime.utcnow()
    db.commit()
    
    # Log them in
    access_token = create_access_token(data={"sub": new_user.email})
    refresh_token = create_refresh_token(data={"sub": new_user.email})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": new_user
    }
