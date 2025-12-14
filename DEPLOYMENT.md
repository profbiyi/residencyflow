# ResidencyFlow - Production Deployment Guide

## Architecture Overview

### Control Plane
- **FastAPI**: REST API, validation, orchestration
- **PostgreSQL + RLS**: Multi-tenant data storage with row-level security
- **Redis**: Job queue, caching, distributed locks
- **Keycloak**: Identity & access management (OIDC/OAuth2)

### Data Plane
- **Prefect Server**: Workflow orchestration, scheduling, retries
- **dlt Workers**: Data movement with Polars for performance
- **MinIO**: S3-compatible storage for dlt state and artifacts

### Observability
- **Prometheus**: Metrics collection
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **OpenTelemetry**: Distributed tracing

### Infrastructure
- **Caddy**: Reverse proxy with automatic TLS
- **Docker Compose**: Container orchestration

---

## Prerequisites

### Server Requirements (Contabo)
- **CPU**: 8+ cores recommended
- **RAM**: 32GB minimum (64GB recommended)
- **Storage**: 500GB SSD minimum
- **OS**: Ubuntu 22.04 LTS

### Software Requirements
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Verify installations
docker --version
docker compose version
```

---

## Initial Setup

### 1. Clone Repository
```bash
cd /opt
git clone https://github.com/profbiyi/residencyflow.git
cd residencyflow
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.prod.example .env.prod

# Generate strong passwords
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 32  # For REDIS_PASSWORD
openssl rand -base64 32  # For JWT_SECRET
openssl rand -base64 20  # For MINIO_ACCESS_KEY
openssl rand -base64 32  # For MINIO_SECRET_KEY

# Edit .env.prod with your values
nano .env.prod
```

### 3. Configure DNS
Point these domains to your Contabo server IP:
```
residencyflow.com           -> YOUR_IP
api.residencyflow.com       -> YOUR_IP
auth.residencyflow.com      -> YOUR_IP
monitor.residencyflow.com   -> YOUR_IP
prefect.residencyflow.com   -> YOUR_IP
```

### 4. Start Services
```bash
# Load environment variables
export $(cat .env.prod | xargs)

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Check service status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

---

## Service Access

### URLs
- **Frontend**: https://residencyflow.com
- **API**: https://api.residencyflow.com
- **Keycloak**: https://auth.residencyflow.com
- **Grafana**: https://monitor.residencyflow.com
- **Prefect**: https://prefect.residencyflow.com
- **MinIO Console**: https://residencyflow.com:9001

### Default Credentials
**Change these immediately after first login!**

- **Keycloak Admin**: admin / (from KEYCLOAK_ADMIN_PASSWORD)
- **Grafana**: admin / (from GRAFANA_ADMIN_PASSWORD)
- **MinIO**: (from MINIO_ACCESS_KEY) / (from MINIO_SECRET_KEY)

---

## Post-Deployment Configuration

### 1. Configure Keycloak

```bash
# Access Keycloak admin console
https://auth.residencyflow.com

# Create realm: residencyflow
# Create client: residencyflow-api
# Configure OIDC endpoints
# Set up roles: super_admin, admin, user
```

### 2. Initialize MinIO Buckets
```bash
# Access MinIO console
https://residencyflow.com:9001

# Create buckets:
- dlt-state          # For dlt pipeline state
- pipeline-artifacts # For intermediate data
- backups           # For database backups
```

### 3. Configure Postgres RLS

```bash
# Connect to database
docker exec -it residencyflow-db psql -U residency -d residencyflow

# Enable RLS on tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

# Create policies (example for organizations table)
CREATE POLICY org_isolation ON organizations
    FOR ALL
    TO PUBLIC
    USING (id = current_setting('app.current_org_id', TRUE)::uuid);

# Users can only see their organization's data
CREATE POLICY user_org_isolation ON users
    FOR ALL
    TO PUBLIC
    USING (organization_id = current_setting('app.current_org_id', TRUE)::uuid);
```

### 4. Set up Prometheus Targets

Create `monitoring/prometheus.yml`:
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'fastapi'
    static_configs:
      - targets: ['api:8000']
  
  - job_name: 'prefect'
    static_configs:
      - targets: ['prefect:4200']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres_exporter:9187']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['redis_exporter:9121']
```

### 5. Configure Grafana Dashboards

Import pre-built dashboards:
```bash
# Copy dashboard JSONs
cp monitoring/grafana/dashboards/*.json /path/to/grafana/provisioning/dashboards/

# Restart Grafana
docker compose -f docker-compose.prod.yml restart grafana
```

---

## Backup Strategy

### Automated Daily Backups

Create `/opt/residencyflow/scripts/backup.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/opt/backups/residencyflow"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup Postgres
docker exec residencyflow-db pg_dumpall -U residency | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

# Backup MinIO (using mc CLI)
docker run --rm --network residencyflow_backend \
  -v $BACKUP_DIR:/backup \
  minio/mc \
  mirror minio:9000/dlt-state /backup/minio_$DATE

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "postgres_*.sql.gz" -mtime +30 -delete
find $BACKUP_DIR -name "minio_*" -mtime +30 -exec rm -rf {} +

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
# Run daily at 2 AM
0 2 * * * /opt/residencyflow/scripts/backup.sh >> /var/log/residencyflow-backup.log 2>&1
```

---

## Monitoring & Alerts

### Grafana Alert Rules

1. **High API Latency**
```
avg(http_request_duration_seconds) > 2
```

2. **Pipeline Failure Rate**
```
rate(pipeline_failures_total[5m]) > 0.1
```

3. **Database Connection Pool Exhaustion**
```
postgres_connections_used / postgres_connections_max > 0.9
```

4. **Disk Space Low**
```
node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
```

---

## Scaling

### Horizontal Scaling

Scale workers:
```bash
docker compose -f docker-compose.prod.yml up -d --scale worker=4
```

### Vertical Scaling

Update resource limits in `docker-compose.prod.yml`:
```yaml
worker:
  deploy:
    replicas: 4
    resources:
      limits:
        cpus: '4'
        memory: 8G
```

---

## Troubleshooting

### View Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api

# With timestamps
docker compose -f docker-compose.prod.yml logs -f --timestamps api
```

### Restart Services
```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart api
```

### Database Console
```bash
docker exec -it residencyflow-db psql -U residency -d residencyflow
```

### Redis Console
```bash
docker exec -it residencyflow-redis redis-cli -a $REDIS_PASSWORD
```

---

## Security Checklist

- [ ] Changed all default passwords
- [ ] Enabled firewall (ufw)
- [ ] Configured fail2ban
- [ ] Set up automatic security updates
- [ ] Enabled audit logging
- [ ] Configured backup encryption
- [ ] Set up SSL/TLS certificates (Caddy handles this)
- [ ] Configured Postgres RLS policies
- [ ] Enabled rate limiting in API
- [ ] Set up monitoring alerts

---

## Maintenance

### Update Services
```bash
cd /opt/residencyflow
git pull origin main
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

### Database Migrations
```bash
docker exec -it residencyflow-api python -m alembic upgrade head
```

### Clean Up
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune
```

---

## Support & Documentation

- **GitHub**: https://github.com/profbiyi/residencyflow
- **Documentation**: https://docs.residencyflow.com
- **Support**: support@residencyflow.com
