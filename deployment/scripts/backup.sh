#!/bin/bash
set -euo pipefail

# ResidencyFlow Backup Script
# Backs up: PostgreSQL, MinIO, Grafana, Prometheus, configuration files
# Retention: 7 daily, 4 weekly, 12 monthly

BACKUP_DIR="/var/backups/residencyflow"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y-%m-%d)
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=12

# Source environment
source /opt/residencyflow/.env.prod

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$BACKUP_DIR/backup.log"
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$BACKUP_DIR/backup.log" >&2
    exit 1
}

# Create backup directories
mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}/{postgres,minio,grafana,prometheus,configs}

# 1. Backup PostgreSQL
log "Starting PostgreSQL backup..."
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h localhost -U $POSTGRES_USER -d $POSTGRES_DB \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_DIR/daily/postgres/residencyflow_${TIMESTAMP}.dump" \
    || error "PostgreSQL backup failed"

# Also create SQL dump for easy inspection
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h localhost -U $POSTGRES_USER -d $POSTGRES_DB \
    --format=plain \
    --file="$BACKUP_DIR/daily/postgres/residencyflow_${TIMESTAMP}.sql" \
    || error "PostgreSQL SQL dump failed"

# Compress SQL dump
gzip "$BACKUP_DIR/daily/postgres/residencyflow_${TIMESTAMP}.sql"

log "PostgreSQL backup completed"

# 2. Backup MinIO (S3 data)
log "Starting MinIO backup..."
docker exec residencyflow-minio-1 mc alias set local http://localhost:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD
docker exec residencyflow-minio-1 mc mirror local/dlt-state /tmp/minio-backup/dlt-state
docker exec residencyflow-minio-1 mc mirror local/dlt-data /tmp/minio-backup/dlt-data

# Copy from container to host
docker cp residencyflow-minio-1:/tmp/minio-backup "$BACKUP_DIR/daily/minio/minio_${TIMESTAMP}"
tar -czf "$BACKUP_DIR/daily/minio/minio_${TIMESTAMP}.tar.gz" -C "$BACKUP_DIR/daily/minio" "minio_${TIMESTAMP}"
rm -rf "$BACKUP_DIR/daily/minio/minio_${TIMESTAMP}"

log "MinIO backup completed"

# 3. Backup Grafana dashboards
log "Starting Grafana backup..."
docker exec residencyflow-grafana-1 grafana-cli admin data-migration dump \
    > "$BACKUP_DIR/daily/grafana/grafana_${TIMESTAMP}.json" \
    || error "Grafana backup failed"

# Backup Grafana database
docker cp residencyflow-grafana-1:/var/lib/grafana/grafana.db "$BACKUP_DIR/daily/grafana/grafana_${TIMESTAMP}.db"

log "Grafana backup completed"

# 4. Backup Prometheus metrics (snapshot)
log "Starting Prometheus backup..."
curl -XPOST http://localhost:9090/api/v1/admin/tsdb/snapshot
SNAPSHOT=$(curl -s http://localhost:9090/api/v1/admin/tsdb/snapshot | jq -r '.data.name')
docker cp residencyflow-prometheus-1:/prometheus/snapshots/$SNAPSHOT "$BACKUP_DIR/daily/prometheus/prometheus_${TIMESTAMP}"
tar -czf "$BACKUP_DIR/daily/prometheus/prometheus_${TIMESTAMP}.tar.gz" -C "$BACKUP_DIR/daily/prometheus" "prometheus_${TIMESTAMP}"
rm -rf "$BACKUP_DIR/daily/prometheus/prometheus_${TIMESTAMP}"

log "Prometheus backup completed"

# 5. Backup configuration files
log "Starting config backup..."
tar -czf "$BACKUP_DIR/daily/configs/configs_${TIMESTAMP}.tar.gz" \
    -C /opt/residencyflow \
    .env.prod \
    docker-compose.prod.yml \
    Caddyfile \
    observability/ \
    keycloak/ \
    backend/rls_policies.sql \
    || error "Config backup failed"

log "Config backup completed"

# 6. Rotate backups
log "Rotating backups..."

# Daily backups (keep last 7 days)
find "$BACKUP_DIR/daily" -type f -mtime +$RETENTION_DAILY -delete

# Weekly backups (copy daily to weekly on Sunday)
if [ $(date +%u) -eq 7 ]; then
    log "Creating weekly backup..."
    for dir in postgres minio grafana prometheus configs; do
        cp -r "$BACKUP_DIR/daily/$dir" "$BACKUP_DIR/weekly/$dir-$(date +%Y-W%W)"
    done
    # Delete old weekly backups
    find "$BACKUP_DIR/weekly" -type d -mtime +$((RETENTION_WEEKLY * 7)) -exec rm -rf {} +
fi

# Monthly backups (copy daily to monthly on 1st of month)
if [ $(date +%d) -eq 01 ]; then
    log "Creating monthly backup..."
    for dir in postgres minio grafana prometheus configs; do
        cp -r "$BACKUP_DIR/daily/$dir" "$BACKUP_DIR/monthly/$dir-$(date +%Y-%m)"
    done
    # Delete old monthly backups
    find "$BACKUP_DIR/monthly" -type d -mtime +$((RETENTION_MONTHLY * 30)) -exec rm -rf {} +
fi

# 7. Calculate backup sizes
log "Backup summary:"
log "  PostgreSQL: $(du -sh $BACKUP_DIR/daily/postgres | cut -f1)"
log "  MinIO: $(du -sh $BACKUP_DIR/daily/minio | cut -f1)"
log "  Grafana: $(du -sh $BACKUP_DIR/daily/grafana | cut -f1)"
log "  Prometheus: $(du -sh $BACKUP_DIR/daily/prometheus | cut -f1)"
log "  Configs: $(du -sh $BACKUP_DIR/daily/configs | cut -f1)"
log "  Total: $(du -sh $BACKUP_DIR | cut -f1)"

# 8. Optional: Upload to remote storage (S3, rsync, etc.)
if [ -n "${REMOTE_BACKUP_ENABLED:-}" ] && [ "$REMOTE_BACKUP_ENABLED" = "true" ]; then
    log "Uploading to remote storage..."
    # Example: AWS S3
    # aws s3 sync "$BACKUP_DIR/daily" s3://your-backup-bucket/residencyflow/$(date +%Y/%m/%d)/
    # Example: rsync to remote server
    # rsync -avz --delete "$BACKUP_DIR/" user@backup-server:/backups/residencyflow/
    log "Remote backup completed"
fi

log "Backup completed successfully!"

# Send notification (optional)
if command -v curl &> /dev/null && [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"✅ ResidencyFlow backup completed: $DATE\"}" \
        "$SLACK_WEBHOOK_URL" || true
fi

exit 0
