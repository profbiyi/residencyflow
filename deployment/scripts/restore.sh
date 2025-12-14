#!/bin/bash
set -euo pipefail

# ResidencyFlow Restore Script
# Restores from backup: PostgreSQL, MinIO, Grafana, Prometheus, configs

BACKUP_DIR="/var/backups/residencyflow"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    error "This script must be run as root (use sudo)"
fi

# Source environment
source /opt/residencyflow/.env.prod

echo "═══════════════════════════════════════════════════════"
echo "  ResidencyFlow Restore Script"
echo "═══════════════════════════════════════════════════════"
echo ""

# List available backups
echo "Available backups:"
echo ""
echo "Daily backups:"
ls -lh "$BACKUP_DIR/daily/postgres/" | grep -E "\.dump$|\.sql\.gz$" | tail -5
echo ""
echo "Weekly backups:"
ls -ld "$BACKUP_DIR/weekly/"* 2>/dev/null | tail -3 || echo "  No weekly backups"
echo ""
echo "Monthly backups:"
ls -ld "$BACKUP_DIR/monthly/"* 2>/dev/null | tail -3 || echo "  No monthly backups"
echo ""

# Prompt for backup selection
read -p "Enter backup type (daily/weekly/monthly): " BACKUP_TYPE
read -p "Enter backup timestamp (e.g., 20240115_143000): " TIMESTAMP

POSTGRES_BACKUP="$BACKUP_DIR/$BACKUP_TYPE/postgres/residencyflow_${TIMESTAMP}.dump"
MINIO_BACKUP="$BACKUP_DIR/$BACKUP_TYPE/minio/minio_${TIMESTAMP}.tar.gz"
GRAFANA_BACKUP="$BACKUP_DIR/$BACKUP_TYPE/grafana/grafana_${TIMESTAMP}.json"
PROMETHEUS_BACKUP="$BACKUP_DIR/$BACKUP_TYPE/prometheus/prometheus_${TIMESTAMP}.tar.gz"
CONFIG_BACKUP="$BACKUP_DIR/$BACKUP_TYPE/configs/configs_${TIMESTAMP}.tar.gz"

# Verify backups exist
if [ ! -f "$POSTGRES_BACKUP" ]; then
    error "PostgreSQL backup not found: $POSTGRES_BACKUP"
fi

echo ""
warn "⚠️  This will OVERWRITE existing data!"
warn "    - PostgreSQL database will be dropped and recreated"
warn "    - MinIO buckets will be replaced"
warn "    - Grafana dashboards will be replaced"
warn "    - Prometheus metrics will be replaced"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Stop services
log "Stopping ResidencyFlow services..."
systemctl stop residencyflow.service || warn "Could not stop via systemd, stopping docker-compose..."
docker-compose -f /opt/residencyflow/docker-compose.prod.yml down

# 1. Restore PostgreSQL
log "Restoring PostgreSQL..."
docker-compose -f /opt/residencyflow/docker-compose.prod.yml up -d postgres
sleep 10  # Wait for postgres to start

# Drop existing database
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d postgres -c "CREATE DATABASE $POSTGRES_DB;"

# Restore from dump
PGPASSWORD=$POSTGRES_PASSWORD pg_restore -h localhost -U $POSTGRES_USER -d $POSTGRES_DB \
    --clean --if-exists --no-owner --no-acl \
    "$POSTGRES_BACKUP" || error "PostgreSQL restore failed"

# Reapply RLS policies
if [ -f /opt/residencyflow/backend/rls_policies.sql ]; then
    log "Reapplying RLS policies..."
    PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB \
        -f /opt/residencyflow/backend/rls_policies.sql
fi

log "PostgreSQL restore completed"

# 2. Restore MinIO
if [ -f "$MINIO_BACKUP" ]; then
    log "Restoring MinIO..."
    docker-compose -f /opt/residencyflow/docker-compose.prod.yml up -d minio
    sleep 10
    
    # Extract backup
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$MINIO_BACKUP" -C "$TEMP_DIR"
    
    # Copy to container
    docker cp "$TEMP_DIR/minio_${TIMESTAMP}/dlt-state" residencyflow-minio-1:/tmp/restore/
    docker cp "$TEMP_DIR/minio_${TIMESTAMP}/dlt-data" residencyflow-minio-1:/tmp/restore/
    
    # Restore buckets
    docker exec residencyflow-minio-1 mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
    docker exec residencyflow-minio-1 mc rb --force local/dlt-state || true
    docker exec residencyflow-minio-1 mc rb --force local/dlt-data || true
    docker exec residencyflow-minio-1 mc mb local/dlt-state
    docker exec residencyflow-minio-1 mc mb local/dlt-data
    docker exec residencyflow-minio-1 mc mirror /tmp/restore/dlt-state local/dlt-state
    docker exec residencyflow-minio-1 mc mirror /tmp/restore/dlt-data local/dlt-data
    
    rm -rf "$TEMP_DIR"
    log "MinIO restore completed"
fi

# 3. Restore Grafana
if [ -f "$GRAFANA_BACKUP" ]; then
    log "Restoring Grafana..."
    docker-compose -f /opt/residencyflow/docker-compose.prod.yml up -d grafana
    sleep 10
    
    # Copy backup to container
    docker cp "$GRAFANA_BACKUP" residencyflow-grafana-1:/tmp/restore.json
    docker exec residencyflow-grafana-1 grafana-cli admin data-migration restore /tmp/restore.json
    
    log "Grafana restore completed"
fi

# 4. Restore Prometheus
if [ -f "$PROMETHEUS_BACKUP" ]; then
    log "Restoring Prometheus..."
    
    # Extract to Prometheus data directory
    docker-compose -f /opt/residencyflow/docker-compose.prod.yml down prometheus
    TEMP_DIR=$(mktemp -d)
    tar -xzf "$PROMETHEUS_BACKUP" -C "$TEMP_DIR"
    
    # Copy to volume
    docker volume rm residencyflow_prometheus_data || true
    docker volume create residencyflow_prometheus_data
    docker run --rm -v residencyflow_prometheus_data:/data -v "$TEMP_DIR":/backup alpine \
        cp -r /backup/prometheus_${TIMESTAMP}/* /data/
    
    rm -rf "$TEMP_DIR"
    log "Prometheus restore completed"
fi

# 5. Restore configs
if [ -f "$CONFIG_BACKUP" ]; then
    log "Restoring configuration files..."
    tar -xzf "$CONFIG_BACKUP" -C /opt/residencyflow/
    log "Config restore completed"
fi

# Start all services
log "Starting all services..."
systemctl start residencyflow.service || docker-compose -f /opt/residencyflow/docker-compose.prod.yml up -d

# Wait for services to be healthy
log "Waiting for services to be healthy..."
sleep 30

# Health check
HEALTH_CHECKS=(
    "http://localhost:8000/health|API"
    "http://localhost:4200/api/health|Prefect"
    "http://localhost:9000/minio/health/live|MinIO"
    "http://localhost:3001/api/health|Grafana"
    "http://localhost:9090/-/healthy|Prometheus"
)

echo ""
log "Running health checks..."
for check in "${HEALTH_CHECKS[@]}"; do
    IFS='|' read -r url name <<< "$check"
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "  ✅ $name: healthy"
    else
        warn "  ❌ $name: unhealthy"
    fi
done

echo ""
log "════════════════════════════════════════════════════"
log "  Restore completed!"
log "════════════════════════════════════════════════════"
echo ""
log "Next steps:"
echo "  1. Verify data integrity in the application"
echo "  2. Check Grafana dashboards"
echo "  3. Test pipeline execution"
echo "  4. Review logs: journalctl -u residencyflow.service -f"
echo ""

exit 0
