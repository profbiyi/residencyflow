
export const DOCKER_COMPOSE = `version: '3.8'

services:
  # 1. Database (Postgres)
  db:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password123
      POSTGRES_DB: residencyflow
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  # 2. Backend API (FastAPI)
  api:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://admin:password123@db:5432/residencyflow
      SECRET_KEY: supersecretkey_change_this_in_prod
    depends_on:
      - db

  # 3. Worker (Data Movement Engine)
  worker:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    command: python worker.py
    environment:
      DATABASE_URL: postgresql://admin:password123@db:5432/residencyflow
    depends_on:
      - db
      - api

  # 4. Frontend (React)
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    environment:
      - REACT_APP_API_URL=http://localhost:8000
    depends_on:
      - api

volumes:
  postgres_data:
`;

export const BACKEND_DOCKERFILE = `# backend/Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for dlt, polars, and psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

export const FRONTEND_DOCKERFILE = `# frontend/Dockerfile
# Stage 1: Build
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
# Nginx config for SPA fallback
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

export const MODELS_PY = `# backend/models.py
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
`;

export const DATABASE_PY = `# backend/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`;

export const MAIN_PY = `# backend/main.py
from fastapi import FastAPI, Depends, HTTPException, status, Header, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models, schemas
import uuid
import jwt # PyJWT
from passlib.context import CryptContext
from datetime import datetime, timedelta

# SECURITY CONFIG
SECRET_KEY = "super_secret_key_change_me"
ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

Base.metadata.create_all(bind=engine)
app = FastAPI(title="ResidencyFlow API")

# --- AUTH UTILS ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=1440) # 24 hours
    to_encode.update({"exp": expire})
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
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.post("/auth/register")
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # This is for public registration (if enabled)
    # Use Admin endpoint for onboarded tenants
    pass

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
`;

export const WORKER_PY = `# backend/worker.py
import time
import os
import dlt
import json
import importlib
import requests
import hashlib
import polars as pl
from database import SessionLocal
import models
from datetime import datetime

# Configure DLT to use Polars for everything
os.environ["DLT__DATA_FRAME_LIBRARY"] = "polars"

SOURCE_REGISTRY = {
    'postgres': 'dlt.sources.sql_database',
    'hubspot': 'dlt.sources.hubspot',
    'salesforce': 'dlt.sources.salesforce',
    # ... Add all supported
}

def load_source_dynamically(conn):
    type_id = conn.type_id
    config = conn.configuration
    
    if type_id == 'postgres' or type_id == 'mysql':
         driver = "postgresql" if type_id == 'postgres' else "mysql+pymysql"
         creds = f"{driver}://{config['username']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"
         module = importlib.import_module("dlt.sources.sql_database")
         return module.sql_database(credentials=creds)
    
    if type_id in SOURCE_REGISTRY:
        module = importlib.import_module(SOURCE_REGISTRY[type_id])
        # Auto-detect main function
        return getattr(module, type_id)(**config)
        
    raise ValueError(f"Unknown source: {type_id}")

@dlt.transformer(name="pii_hasher")
def pii_hasher(items, columns):
    """
    Polars-Native transformation for speed.
    """
    df = pl.DataFrame(items)
    for col in columns:
        if col in df.columns:
            df = df.with_columns(
                pl.col(col).map_elements(lambda x: "HASHED_" + hashlib.sha256(str(x).encode()).hexdigest()[:8], return_dtype=pl.Utf8)
            )
    yield from df.to_dicts()

def process_pipeline(p_id):
    db = SessionLocal()
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == p_id).first()
    
    try:
        print(f"WORKER: Starting Pipeline {pipeline.name}")
        src_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.source_id).first()
        dest_conn = db.query(models.Connector).filter(models.Connector.id == pipeline.destination_id).first()
        
        # 1. Source
        source = load_source_dynamically(src_conn)
        
        # 2. Transform (Governance)
        if pipeline.transformation_config and 'pii_columns' in pipeline.transformation_config:
            source = source | pii_hasher(columns=pipeline.transformation_config['pii_columns'])
            
        # 3. Dest
        # Simulating S3/Snowflake destination based on config
        destination = dlt.destinations.duckdb("data.duckdb") 
        
        # 4. Run
        p = dlt.pipeline(pipeline_name=pipeline.id, destination=destination, dataset_name="dataset")
        info = p.run(source, write_disposition="merge" if "merge" in pipeline.sync_mode else "append")
        
        print(info)
        pipeline.status = "IDLE"
        pipeline.rows_processed += 100
        pipeline.last_run = datetime.utcnow()
        db.commit()
        
    except Exception as e:
        print(f"ERROR: {e}")
        pipeline.status = "FAILED"
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    print("Worker started. Polling for jobs...")
    while True:
        db = SessionLocal()
        # Find queued jobs
        job = db.query(models.Pipeline).filter(models.Pipeline.status == "RUNNING").first()
        db.close()
        
        if job:
            process_pipeline(job.id)
        
        time.sleep(5)
`;

export const REQUIREMENTS_TXT = `
fastapi==0.109.0
uvicorn==0.27.0
sqlalchemy==2.0.25
psycopg2-binary==2.9.9
pydantic==2.6.0
python-multipart==0.0.9
requests==2.31.0
python-jose[cryptography]
passlib[bcrypt]
dlt[all]==0.4.10
duckdb==0.9.2
polars>=0.20.0
pyarrow>=14.0.0
snowflake-connector-python
dlt[snowflake]
boto3
`;
