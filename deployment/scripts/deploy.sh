#!/bin/bash
set -euo pipefail

# ResidencyFlow Deployment Script for Contabo
# Sets up complete production environment from scratch

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    error "This script must be run as root (use sudo)"
fi

echo "═══════════════════════════════════════════════════════"
echo "  ResidencyFlow Production Deployment"
echo "  Target: Contabo VPS"
echo "═══════════════════════════════════════════════════════"
echo ""

# System requirements check
log "Checking system requirements..."

# Check OS
if [ ! -f /etc/os-release ]; then
    error "Cannot determine OS version"
fi

source /etc/os-release
if [ "$ID" != "ubuntu" ] && [ "$ID" != "debian" ]; then
    warn "This script is tested on Ubuntu/Debian. Your OS: $ID $VERSION_ID"
    read -p "Continue anyway? (y/n): " CONTINUE
    [ "$CONTINUE" != "y" ] && exit 0
fi

# Check memory
TOTAL_MEM=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 8 ]; then
    warn "Recommended memory: 8GB+. Available: ${TOTAL_MEM}GB"
fi

# Check disk
TOTAL_DISK=$(df -BG / | awk 'NR==2 {print $2}' | sed 's/G//')
if [ "$TOTAL_DISK" -lt 50 ]; then
    warn "Recommended disk: 50GB+. Available: ${TOTAL_DISK}GB"
fi

log "System check completed"

# Step 1: Update system
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    curl \
    wget \
    git \
    jq \
    htop \
    vim \
    ufw \
    fail2ban \
    postgresql-client \
    unzip

log "System packages updated"

# Step 2: Install Docker
if ! command -v docker &> /dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed"
else
    log "Docker already installed: $(docker --version)"
fi

# Step 3: Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log "Installing Docker Compose..."
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name)
    curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    log "Docker Compose installed: ${COMPOSE_VERSION}"
else
    log "Docker Compose already installed: $(docker-compose --version)"
fi

# Step 4: Configure firewall
log "Configuring firewall..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw status
log "Firewall configured"

# Step 5: Configure fail2ban (SSH protection)
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = %(sshd_log)s
backend = systemd
EOF
systemctl enable fail2ban
systemctl restart fail2ban
log "fail2ban configured"

# Step 6: Create application user
if ! id -u residencyflow &>/dev/null; then
    log "Creating application user..."
    useradd -r -m -s /bin/bash residencyflow
    usermod -aG docker residencyflow
    log "User 'residencyflow' created"
else
    log "User 'residencyflow' already exists"
fi

# Step 7: Create application directory
log "Creating application directory..."
mkdir -p /opt/residencyflow
mkdir -p /var/backups/residencyflow
mkdir -p /var/log/residencyflow
chown -R residencyflow:residencyflow /opt/residencyflow
chown -R residencyflow:residencyflow /var/backups/residencyflow
chown -R residencyflow:residencyflow /var/log/residencyflow
log "Directories created"

# Step 8: Clone repository or copy files
log "Setting up application files..."
read -p "Do you want to clone from Git repository? (y/n): " USE_GIT

if [ "$USE_GIT" = "y" ]; then
    read -p "Enter Git repository URL: " GIT_REPO
    read -p "Enter branch (default: main): " GIT_BRANCH
    GIT_BRANCH=${GIT_BRANCH:-main}
    
    cd /opt/residencyflow
    git clone -b "$GIT_BRANCH" "$GIT_REPO" .
    chown -R residencyflow:residencyflow /opt/residencyflow
else
    warn "Please manually copy your application files to /opt/residencyflow"
    read -p "Press Enter when files are copied..."
fi

# Step 9: Environment configuration
log "Configuring environment..."

if [ ! -f /opt/residencyflow/.env.prod ]; then
    if [ -f /opt/residencyflow/.env.prod.example ]; then
        cp /opt/residencyflow/.env.prod.example /opt/residencyflow/.env.prod
        info "Created .env.prod from example"
    else
        error "No .env.prod or .env.prod.example found!"
    fi
fi

# Generate secrets
log "Generating secure secrets..."
SECRET_KEY=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 24)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24)

# Update .env.prod with generated secrets
sed -i "s|SECRET_KEY=.*|SECRET_KEY=${SECRET_KEY}|" /opt/residencyflow/.env.prod
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" /opt/residencyflow/.env.prod
sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" /opt/residencyflow/.env.prod
sed -i "s|MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}|" /opt/residencyflow/.env.prod
sed -i "s|KEYCLOAK_ADMIN_PASSWORD=.*|KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}|" /opt/residencyflow/.env.prod
sed -i "s|GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}|" /opt/residencyflow/.env.prod

# Prompt for domain
read -p "Enter your domain (e.g., residencyflow.com): " DOMAIN
if [ -n "$DOMAIN" ]; then
    sed -i "s|DOMAIN=.*|DOMAIN=${DOMAIN}|" /opt/residencyflow/.env.prod
    sed -i "s|yourdomain.com|${DOMAIN}|g" /opt/residencyflow/Caddyfile
fi

# Save credentials securely
cat > /root/.residencyflow-credentials <<EOF
ResidencyFlow Production Credentials
Generated: $(date)

PostgreSQL:
  User: postgres
  Password: ${POSTGRES_PASSWORD}
  Database: residencyflow

Redis:
  Password: ${REDIS_PASSWORD}

MinIO:
  User: minioadmin
  Password: ${MINIO_ROOT_PASSWORD}

Keycloak:
  Admin User: admin
  Admin Password: ${KEYCLOAK_ADMIN_PASSWORD}

Grafana:
  Admin User: admin
  Admin Password: ${GRAFANA_ADMIN_PASSWORD}

Secret Key: ${SECRET_KEY}

IMPORTANT: Store these credentials in a secure password manager!
EOF
chmod 600 /root/.residencyflow-credentials

log "Secrets generated and saved to /root/.residencyflow-credentials"

# Step 10: Install systemd service
log "Installing systemd service..."
cp /opt/residencyflow/deployment/systemd/residencyflow.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable residencyflow.service
log "Systemd service installed"

# Step 11: Setup backup cron job
log "Setting up automated backups..."
cp /opt/residencyflow/deployment/scripts/backup.sh /usr/local/bin/residencyflow-backup
cp /opt/residencyflow/deployment/scripts/restore.sh /usr/local/bin/residencyflow-restore
chmod +x /usr/local/bin/residencyflow-backup
chmod +x /usr/local/bin/residencyflow-restore

# Daily backup at 2 AM
(crontab -l 2>/dev/null || true; echo "0 2 * * * /usr/local/bin/residencyflow-backup >> /var/log/residencyflow/backup.log 2>&1") | crontab -

log "Backup cron job configured (daily at 2 AM)"

# Step 12: Pull Docker images
log "Pulling Docker images (this may take several minutes)..."
cd /opt/residencyflow
docker-compose -f docker-compose.prod.yml pull

# Step 13: Start services
log "Starting ResidencyFlow services..."
systemctl start residencyflow.service

# Wait for services to start
log "Waiting for services to initialize (60 seconds)..."
sleep 60

# Step 14: Initialize database
log "Initializing database..."
cd /opt/residencyflow

# Run migrations (if you have a migration script)
# docker-compose -f docker-compose.prod.yml exec -T api python -m alembic upgrade head

# Apply RLS policies
if [ -f backend/rls_policies.sql ]; then
    log "Applying RLS policies..."
    docker-compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d residencyflow -f /docker-entrypoint-initdb.d/rls_policies.sql || warn "RLS policies failed (may already be applied)"
fi

# Step 15: Health checks
log "Running health checks..."
HEALTH_CHECKS=(
    "http://localhost:8000/health|API|8000"
    "http://localhost:4200/api/health|Prefect|4200"
    "http://localhost:9000/minio/health/live|MinIO|9000"
    "http://localhost:3001/api/health|Grafana|3001"
    "http://localhost:9090/-/healthy|Prometheus|9090"
)

ALL_HEALTHY=true
for check in "${HEALTH_CHECKS[@]}"; do
    IFS='|' read -r url name port <<< "$check"
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "  ✅ $name (port $port): healthy"
    else
        warn "  ❌ $name (port $port): unhealthy or not responding"
        ALL_HEALTHY=false
    fi
done

# Step 16: DNS instructions
echo ""
echo "═══════════════════════════════════════════════════════"
log "Deployment completed!"
echo "═══════════════════════════════════════════════════════"
echo ""

SERVER_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
info "Server IP: $SERVER_IP"
echo ""

if [ -n "$DOMAIN" ]; then
    echo "📋 DNS Configuration Required:"
    echo "  Add the following DNS records:"
    echo ""
    echo "  Type  | Name              | Value"
    echo "  ------|-------------------|------------------"
    echo "  A     | @                 | $SERVER_IP"
    echo "  A     | www               | $SERVER_IP"
    echo "  A     | api               | $SERVER_IP"
    echo "  A     | prefect           | $SERVER_IP"
    echo "  A     | auth              | $SERVER_IP"
    echo "  A     | monitor           | $SERVER_IP"
    echo "  A     | storage           | $SERVER_IP"
    echo ""
    echo "  Wait 5-10 minutes for DNS propagation"
    echo "  Caddy will automatically obtain SSL certificates"
    echo ""
fi

echo "🔑 Credentials saved to: /root/.residencyflow-credentials"
echo ""
echo "🌐 Service URLs:"
echo "  Main App:      https://${DOMAIN:-$SERVER_IP}"
echo "  API:           https://api.${DOMAIN:-$SERVER_IP}"
echo "  Prefect:       https://prefect.${DOMAIN:-$SERVER_IP}"
echo "  Keycloak:      https://auth.${DOMAIN:-$SERVER_IP}"
echo "  Grafana:       https://monitor.${DOMAIN:-$SERVER_IP}"
echo "  MinIO:         https://storage.${DOMAIN:-$SERVER_IP}"
echo ""
echo "📊 Monitoring:"
echo "  Prometheus:    http://$SERVER_IP:9090"
echo "  Logs:          journalctl -u residencyflow.service -f"
echo ""
echo "🔧 Useful Commands:"
echo "  Status:        systemctl status residencyflow.service"
echo "  Restart:       systemctl restart residencyflow.service"
echo "  Logs:          journalctl -u residencyflow.service -n 100"
echo "  Backup:        /usr/local/bin/residencyflow-backup"
echo "  Restore:       /usr/local/bin/residencyflow-restore"
echo ""
echo "🚀 Next Steps:"
echo "  1. Configure DNS records (see above)"
echo "  2. Wait for SSL certificates to be issued"
echo "  3. Access Keycloak and create first user"
echo "  4. Configure Grafana dashboards"
echo "  5. Test pipeline execution"
echo ""

if [ "$ALL_HEALTHY" = true ]; then
    log "All services are healthy! 🎉"
else
    warn "Some services are not healthy. Check logs with: journalctl -u residencyflow.service -f"
fi

exit 0
