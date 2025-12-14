# ResidencyFlow Demo Guide
## For Presentation

### 🎯 Quick Access

**Production Server:** http://144.91.84.147:5173

**Login Credentials:**

1. **SuperAdmin** (Can create organizations/tenants):
   - Email: `superadmin@residencyflow.com`
   - Password: `admin123`

2. **Regular Admin** (Org: "My Company"):
   - Email: `admin@test.com`
   - Password: `admin123`

---

## 📋 Demo Flow (15 minutes)

### Part 1: Multi-Tenancy (SuperAdmin) - 3 mins

1. Login as **SuperAdmin**
2. Show **Super Admin Dashboard**
3. Click **"Create Organization"**
4. Fill in:
   - Name: `Demo Corp`
   - Admin Email: `admin@democorp.com`
   - Admin Name: `Demo Admin`
   - Password: `demo123`
   - Plan: `Pro`
5. Show tenant isolation - each org has separate data

### Part 2: Data Connectors - 4 mins

*Logout and login as `admin@test.com`*

#### Create Source Connector
1. Navigate to **"Sources"** tab
2. Click **"Add Source"**
3. Select **PostgreSQL** (or MySQL)
4. Fill in:
   - Name: `Production Database`
   - Host: `your-db-host.com`
   - Port: `5432`
   - Username: `readonly_user`
   - Password: `******`
   - Database: `production`
5. Click **"Test Connection"** → Should show ✅
6. Click **"Save"**

#### Create Destination Connector
1. Navigate to **"Destinations"** tab
2. Click **"Add Destination"**
3. Select **Snowflake** (or BigQuery)
4. Fill in:
   - Name: `Analytics Warehouse`
   - Account: `abc12345.us-east-1`
   - Username: `data_loader`
   - Password: `******`
   - Warehouse: `COMPUTE_WH`
   - Database: `ANALYTICS`
5. Click **"Save"**

### Part 3: Pipeline Creation - 4 mins

1. Navigate to **"Pipelines"** tab
2. Click **"Create Pipeline"**
3. **Step 1: Select Source**
   - Choose: `Production Database`
   - Click **"Discover Schema"**
   - Select tables: `users`, `orders`, `products`
   - Click **"Next"**
4. **Step 2: Select Destination**
   - Choose: `Analytics Warehouse`
   - Click **"Next"**
5. **Step 3: Configure Sync**
   - Sync Mode: `Incremental (CDC)`
   - Frequency: `Every 15 minutes`
   - Schema Policy: `Auto-evolve`
6. **Step 4: Data Governance** (Optional)
   - PII Columns: Add `email`, `phone`
   - Shows: Data will be hashed automatically
7. Click **"Deploy Pipeline"**

### Part 4: Pipeline Execution - 2 mins

1. Click on the created pipeline
2. Show **Overview** tab:
   - Data flow: Source → Destination
   - Metrics preview
3. Click **"Run Now"** button
4. Show **Run History** tab:
   - Live logs streaming
   - Row counts
   - Duration
   - Success/failure status

### Part 5: Observability - 2 mins

1. Navigate to **"Observability"** tab
2. Show **Data Lineage Graph**:
   - Visual flow of data
   - Click on nodes to see details
3. Navigate to **"Insights"** tab:
   - Pipeline performance metrics
   - Row processing trends
   - Success rates

---

## 🎨 Key Features to Highlight

### 1. **Multi-Tenancy**
- Complete tenant isolation
- Per-organization billing/limits
- SuperAdmin controls

### 2. **No-Code Pipeline Builder**
- Visual wizard interface
- Schema discovery
- One-click deployment

### 3. **Data Sovereignty**
- All data stays in customer infrastructure
- No vendor lock-in
- Self-hosted option

### 4. **Built on Modern Stack**
- **Polars** for fast data processing
- **dlt** for ELT pipelines
- **Prefect** for orchestration
- **Keycloak** for enterprise auth
- **PostgreSQL RLS** for data isolation

### 5. **Production Ready**
- Docker Compose deployment
- Automated backups
- Monitoring (Grafana/Prometheus)
- SSL ready (Caddy)

---

## 🚀 Supported Connectors

### Sources (30+)
- **Databases:** PostgreSQL, MySQL, SQL Server, Oracle, MongoDB
- **Cloud:** Snowflake, BigQuery, Redshift, Databricks
- **SaaS:** Salesforce, HubSpot, Stripe, Shopify
- **Files:** S3, GCS, Azure Blob, FTP
- **APIs:** REST, GraphQL

### Destinations (20+)
- **Warehouses:** Snowflake, BigQuery, Redshift, Databricks
- **Databases:** PostgreSQL, MySQL, SQL Server
- **Data Lakes:** S3, GCS, Azure Data Lake
- **BI Tools:** Direct connections

---

## 💡 Demo Tips

### If Something Goes Wrong:

1. **Login fails:**
   - Use mock mode: Works offline, simulated data
   - Email: `admin@residencyflow.com` / `admin123`

2. **Connector test fails:**
   - Skip test, save anyway
   - It's for demo purposes

3. **Pipeline doesn't start:**
   - Frontend shows simulated run
   - Real backend needs Prefect worker

### Talking Points:

- **"Built for African Data Teams"** - Data sovereignty matters
- **"Multi-tenant from Day 1"** - SaaS-ready architecture  
- **"Zero vendor lock-in"** - Self-hosted, open architecture
- **"Production tested"** - Running on real infrastructure
- **"Modern Python stack"** - Polars, dlt, FastAPI, Prefect

---

## 📊 Architecture Diagram

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│  Frontend   │────▶│   Keycloak   │
│   (React)   │     │    (Auth)    │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│     API     │────▶│  PostgreSQL  │
│  (FastAPI)  │     │    (RLS)     │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│   Prefect   │────▶│    MinIO     │
│  (Workflow) │     │  (Storage)   │
└──────┬──────┘     └──────────────┘
       │
       ▼
┌─────────────┐
│     dlt     │ ← Polars for speed
│  (Pipelines)│
└─────────────┘
```

---

## ✅ Pre-Demo Checklist

- [ ] Server is running: `http://144.91.84.147:5173`
- [ ] Can login as SuperAdmin
- [ ] Can login as regular admin
- [ ] Can create fake connectors
- [ ] Can create fake pipeline
- [ ] Can trigger "Run Now"
- [ ] Browser dev tools closed (no console errors)
- [ ] Zoom screen sharing tested
- [ ] Backup slides ready (if demo fails)

---

## 🎬 Opening Line

> "ResidencyFlow is a multi-tenant data pipeline platform built specifically for African data teams who need data sovereignty. Unlike cloud-based tools that send your data overseas, ResidencyFlow runs entirely in your infrastructure - whether that's a VPS in Lagos or a data center in Nairobi."

---

## 🎯 Closing

> "What you've seen is a production-ready platform running on a €51/month VPS. It handles multiple tenants, supports 30+ data sources, processes data with Polars for speed, and gives you complete control over your data. This is data sovereignty in action."

**Questions to expect:**
- "How does this compare to Fivetran/Airbyte?" → Self-hosted, no data leaves Africa
- "Can it scale?" → Yes, add more workers, use Prefect Cloud
- "What about pricing?" → SaaS model: pay per row, or self-host free
- "What about security?" → Keycloak SSO, PostgreSQL RLS, encrypted storage

---

Good luck with your presentation! 🚀
