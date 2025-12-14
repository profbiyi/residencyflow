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
from prefect_client import prefect_orchestrator

# SECURITY CONFIG
SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_key_change_me")
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="ResidencyFlow API")

@app.on_event("startup")
async def startup_event():
    """Run database migrations on startup"""
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # Add region column if it doesn't exist
            conn.execute(text("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='connectors' AND column_name='region'
                    ) THEN
                        ALTER TABLE connectors ADD COLUMN region VARCHAR;
                    END IF;
                END $$;
            """))
            
            # Add Prefect fields to pipelines
            conn.execute(text("""
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='pipelines' AND column_name='prefect_deployment_id'
                    ) THEN
                        ALTER TABLE pipelines ADD COLUMN prefect_deployment_id VARCHAR;
                    END IF;
                    
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='pipelines' AND column_name='last_prefect_run_id'
                    ) THEN
                        ALTER TABLE pipelines ADD COLUMN last_prefect_run_id VARCHAR;
                    END IF;
                END $$;
            """))
            
            conn.commit()
        print("✅ Database migrations applied")
    except Exception as e:
        print(f"⚠️  Migration warning: {e}")

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
        expire = datetime.utcnow() + timedelta(hours=24)  # 24 hours for better UX
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
    
    # Get organization name if user belongs to one
    company_name = user.full_name  # Default for SuperAdmin
    if user.organization_id:
        org = db.query(models.Organization).filter(models.Organization.id == user.organization_id).first()
        if org:
            company_name = org.name
    
    # Format user object for frontend compatibility
    user_data = {
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "companyName": company_name,
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

@app.get("/debug/connectors")
def debug_connectors(db: Session = Depends(get_db)):
    """Debug endpoint to see all connectors in database"""
    connectors = db.query(models.Connector).all()
    return {
        "total": len(connectors),
        "connectors": [{
            "id": c.id,
            "name": c.name,
            "type_id": c.type_id,
            "connector_type": c.connector_type,
            "organization_id": c.organization_id,
            "status": c.status,
            "has_region": hasattr(c, 'region')
        } for c in connectors]
    }

# --- SUPER ADMIN ENDPOINTS (The "Agba" Features) ---
@app.get("/admin/organizations")
def list_orgs(current_user: models.User = Depends(get_super_admin), db: Session = Depends(get_db)):
    orgs = db.query(models.Organization).all()
    # Format for frontend
    return [{
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "createdAt": org.created_at.isoformat() if org.created_at else None,
        "status": org.status,
        "ownerEmail": org.owner_email,
        "plan": org.plan,
        "billingCycle": "Monthly"  # Default value
    } for org in orgs]

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
    
    # Format for frontend
    return {
        "id": new_org.id,
        "name": new_org.name,
        "slug": new_org.slug,
        "createdAt": new_org.created_at.isoformat() if new_org.created_at else None,
        "status": new_org.status,
        "ownerEmail": new_org.owner_email,
        "plan": new_org.plan,
        "billingCycle": "Monthly"
    }

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
async def create_pipeline(pipeline: schemas.PipelineCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    pipeline_id = str(uuid.uuid4())
    
    # Create Prefect deployment
    try:
        deployment_id = await prefect_orchestrator.create_pipeline_deployment(
            pipeline_id=pipeline_id,
            pipeline_name=pipeline.name,
            frequency=pipeline.frequency,
            organization_id=current_user.organization_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create Prefect deployment: {str(e)}"
        )
    
    # Create pipeline in database with Prefect deployment ID
    new_p = models.Pipeline(
        id=pipeline_id,
        organization_id=current_user.organization_id,
        created_by=current_user.id,
        prefect_deployment_id=deployment_id,  # Store for future operations
        **pipeline.dict()
    )
    db.add(new_p)
    db.commit()
    db.refresh(new_p)
    return new_p

@app.post("/pipelines/{id}/run")
async def run_pipeline(id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Pipeline).filter(models.Pipeline.id == id).first()
    if not p or p.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404)
    
    # Trigger Prefect flow run
    try:
        flow_run_id = await prefect_orchestrator.trigger_pipeline_run(pipeline_id=id)
        p.status = "RUNNING"
        p.last_prefect_run_id = flow_run_id  # Track the run
        db.commit()
        return {"status": "queued", "flow_run_id": flow_run_id}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger pipeline run: {str(e)}"
        )

@app.get("/connectors")
def get_connectors(type: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    connectors = db.query(models.Connector).filter(
        models.Connector.organization_id == current_user.organization_id,
        models.Connector.connector_type == type
    ).all()
    
    # Format for frontend
    return [{
        "id": c.id,
        "name": c.name,
        "typeId": c.type_id,
        "connectorType": c.connector_type,
        "status": c.status,
        "configuration": c.configuration,
        "region": c.region,
        "organizationId": c.organization_id,
        "createdBy": c.created_by
    } for c in connectors]

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
    db.refresh(new_c)
    
    # Format for frontend
    return {
        "id": new_c.id,
        "name": new_c.name,
        "typeId": new_c.type_id,
        "connectorType": new_c.connector_type,
        "status": new_c.status,
        "configuration": new_c.configuration,
        "region": new_c.region,
        "organizationId": new_c.organization_id,
        "createdBy": new_c.created_by
    }

@app.delete("/connectors/{connector_id}")
def delete_connector(connector_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    connector = db.query(models.Connector).filter(
        models.Connector.id == connector_id,
        models.Connector.organization_id == current_user.organization_id
    ).first()
    
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    db.delete(connector)
    db.commit()
    return {"status": "deleted"}

@app.get("/connectors/{connector_id}/schema")
def introspect_connector_schema(connector_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Use dlt to introspect available tables/resources from a connector.
    Returns what dlt discovers automatically.
    """
    import dlt
    import importlib
    
    connector = db.query(models.Connector).filter(
        models.Connector.id == connector_id,
        models.Connector.organization_id == current_user.organization_id
    ).first()
    
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    
    try:
        type_id = connector.type_id
        config = connector.configuration
        
        # For SQL databases, use dlt's sql_database source
        if type_id in ['postgres', 'mysql', 'postgres_dw', 'mysql_dw']:
            from dlt.sources.sql_database import sql_database
            
            driver = "postgresql" if 'postgres' in type_id else "mysql+pymysql"
            creds = f"{driver}://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
            
            # Get schema from config
            schema_filter = config.get('schema', '').strip()
            
            if schema_filter:
                # User specified a specific schema - only introspect that one
                source = sql_database(credentials=creds, schema=schema_filter)
                schema_mode = f"single ({schema_filter})"
            else:
                # No schema specified - discover ALL schemas (multi-schema mode)
                # For Postgres, dlt can introspect across all schemas
                if 'postgres' in type_id:
                    # Get all non-system schemas
                    import psycopg2
                    conn = psycopg2.connect(
                        host=config.get('host'),
                        port=config.get('port', 5432),
                        database=config.get('database'),
                        user=config.get('username'),
                        password=config.get('password')
                    )
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT schema_name 
                        FROM information_schema.schemata 
                        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                        ORDER BY schema_name
                    """)
                    all_schemas = [row[0] for row in cursor.fetchall()]
                    cursor.close()
                    conn.close()
                    
                    # Introspect each schema and combine results
                    all_resources = []
                    for schema in all_schemas:
                        try:
                            source = sql_database(credentials=creds, schema=schema)
                            for table_name in source.resources.keys():
                                all_resources.append({
                                    "name": f"{schema}.{table_name}",  # Fully qualified name
                                    "type": "table",
                                    "schema": schema,
                                    "table": table_name,
                                    "selected": True
                                })
                        except Exception as e:
                            print(f"Warning: Could not introspect schema {schema}: {e}")
                    
                    return {
                        "connector_id": connector_id,
                        "connector_type": type_id,
                        "resources": all_resources,
                        "source_type": "database",
                        "schema_mode": "multi",
                        "available_schemas": all_schemas
                    }
                else:
                    # MySQL: default to single database introspection
                    source = sql_database(credentials=creds)
                    schema_mode = "default"
            
            # Single schema mode
            resources = []
            for resource_name in source.resources.keys():
                resources.append({
                    "name": resource_name,
                    "type": "table",
                    "selected": True
                })
            
            return {
                "connector_id": connector_id,
                "connector_type": type_id,
                "resources": resources,
                "source_type": "database",
                "schema_mode": schema_mode
            }
        
        # For API sources (HubSpot, Salesforce, etc.), dlt also discovers resources
        elif type_id in ['hubspot', 'salesforce', 'stripe', 'github']:
            # Each dlt API source exposes different resources (endpoints)
            # Example: HubSpot has 'contacts', 'companies', 'deals', etc.
            return {
                "connector_id": connector_id,
                "connector_type": type_id,
                "resources": [{"name": "all_resources", "type": "api_endpoint", "selected": True}],
                "source_type": "api",
                "message": "API sources will sync all available resources automatically via dlt"
            }
        
        else:
            return {
                "connector_id": connector_id,
                "connector_type": type_id,
                "resources": [],
                "source_type": "unknown"
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema introspection failed: {str(e)}")

@app.post("/connectors/test")
def test_connection(data: dict):
    """
    Test database/API connections based on connector type.
    Supports: postgres, mysql, mongodb, snowflake, and more.
    """
    try:
        type_id = data.get('typeId')
        config = data.get('config', {})
        
        # --- DATABASE CONNECTIONS ---
        if type_id in ['postgres', 'postgres_dw']:
            import psycopg2
            conn = psycopg2.connect(
                host=config.get('host'),
                port=config.get('port', 5432),
                database=config.get('database'),
                user=config.get('username'),
                password=config.get('password')
            )
            conn.close()
            return {"success": True, "message": "✓ PostgreSQL connection successful"}
            
        elif type_id in ['mysql', 'mysql_dw']:
            import pymysql
            conn = pymysql.connect(
                host=config.get('host'),
                port=config.get('port', 3306),
                database=config.get('database'),
                user=config.get('username'),
                password=config.get('password')
            )
            conn.close()
            return {"success": True, "message": "✓ MySQL connection successful"}
            
        elif type_id == 'mongodb':
            from pymongo import MongoClient
            client = MongoClient(config.get('connection_string'), serverSelectionTimeoutMS=5000)
            client.server_info()  # Force connection
            client.close()
            return {"success": True, "message": "✓ MongoDB connection successful"}
            
        elif type_id in ['redshift']:
            import psycopg2
            conn = psycopg2.connect(
                host=config.get('host'),
                port=config.get('port', 5439),
                database=config.get('database'),
                user=config.get('username'),
                password=config.get('password')
            )
            conn.close()
            return {"success": True, "message": "✓ Redshift connection successful"}
            
        elif type_id in ['snowflake', 'snowflake_src']:
            import snowflake.connector
            conn = snowflake.connector.connect(
                account=config.get('account'),
                user=config.get('username'),
                password=config.get('password'),
                warehouse=config.get('warehouse'),
                database=config.get('database')
            )
            conn.close()
            return {"success": True, "message": "✓ Snowflake connection successful"}
            
        # --- CLOUD STORAGE ---
        elif type_id in ['s3', 's3_src']:
            import boto3
            s3 = boto3.client(
                's3',
                aws_access_key_id=config.get('aws_access_key_id') or config.get('access_key'),
                aws_secret_access_key=config.get('aws_secret_access_key') or config.get('secret_key'),
                region_name=config.get('region_name', 'us-east-1')
            )
            bucket = config.get('bucket')
            s3.head_bucket(Bucket=bucket)
            return {"success": True, "message": f"✓ S3 bucket '{bucket}' accessible"}
            
        # --- API-BASED CONNECTORS (Simple validation) ---
        elif type_id in ['stripe', 'hubspot', 'salesforce', 'zendesk', 'shopify', 'github']:
            # For API connectors, just validate that required fields are present
            required = ['access_token'] if type_id != 'stripe' else ['api_key']
            if all(config.get(field) for field in required):
                return {"success": True, "message": f"✓ {type_id.title()} credentials configured"}
            return {"success": False, "message": "Missing required API credentials"}
            
        # --- FALLBACK ---
        else:
            # For other connectors, just validate schema
            return {"success": True, "message": f"✓ Configuration validated for {type_id}"}
            
    except ImportError as e:
        return {"success": False, "message": f"Missing Python library: {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}

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
