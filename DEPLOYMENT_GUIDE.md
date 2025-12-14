# ResidencyFlow Deployment Guide

## Quick Start - Fresh Server Deployment

### Prerequisites
- Ubuntu 22.04+ or Debian 11+ server
- Root/sudo access
- 8GB+ RAM recommended (minimum 4GB)
- 50GB+ disk space

### One-Command Deployment

```bash
# SSH into your server as root
ssh root@your-server-ip

# Clone repository
git clone https://github.com/profbiyi/residencyflow.git /opt/residencyflow
cd /opt/residencyflow

# Run deployment script
sudo ./deployment/scripts/deploy.sh
```

### What the Script Does

The deployment script automatically:

1. ✅ Updates system packages
2. ✅ Installs Docker & Docker Compose
3. ✅ Configures firewall (UFW)
4. ✅ Sets up fail2ban for SSH protection
5. ✅ Creates application user and directories
6. ✅ Generates secure passwords for all services
7. ✅ Creates `.env.prod` with all credentials
8. ✅ Installs systemd service
9. ✅ Sets up automated daily backups (2 AM)
10. ✅ Pulls and starts all Docker containers
11. ✅ Creates databases (residencyflow, prefect, keycloak)
12. ✅ Performs health checks

### Services Deployed

After deployment, the following services will be running:

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 5173 | React UI |
| API | 8000 | FastAPI Backend |
| Prefect | 4200 | Workflow Orchestration |
| Keycloak | 8080 | Authentication |
| Grafana | 3000 | Monitoring Dashboards |
| Prometheus | 9090 | Metrics Collection |
| Loki | 3100 | Log Aggregation |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| MinIO | 9000/9001 | Object Storage |

### Accessing Your Services

After deployment completes, you'll see output like:

```
🌐 Service URLs (direct access via IP):
  Frontend:      http://144.91.84.147:5173
  API:           http://144.91.84.147:8000
  Prefect:       http://144.91.84.147:4200
  Keycloak:      http://144.91.84.147:8080
  Grafana:       http://144.91.84.147:3000
  Prometheus:    http://144.91.84.147:9090
  MinIO Console: http://144.91.84.147:9001
```

### Credentials

All passwords are saved to `/root/.residencyflow-credentials`

```bash
# View credentials
cat /root/.residencyflow-credentials
```

**⚠️ IMPORTANT:** Store these credentials in a secure password manager immediately!

### Post-Deployment Steps

1. **Configure DNS** (if using a domain):
   ```
   A     @           -> YOUR_SERVER_IP
   A     www         -> YOUR_SERVER_IP
   A     api         -> YOUR_SERVER_IP
   A     prefect     -> YOUR_SERVER_IP
   A     auth        -> YOUR_SERVER_IP
   A     monitor     -> YOUR_SERVER_IP
   ```

2. **Setup Keycloak**:
   - Access Keycloak at `http://your-ip:8080`
   - Login with admin credentials from `/root/.residencyflow-credentials`
   - Create a realm and first user

3. **Configure Grafana**:
   - Access Grafana at `http://your-ip:3000`
   - Login with admin credentials
   - Configure dashboards

## Managing Your Deployment

### System Commands

```bash
# Check status
systemctl status residencyflow.service

# View logs
journalctl -u residencyflow.service -f

# Restart all services
systemctl restart residencyflow.service

# Stop services
systemctl stop residencyflow.service

# Start services
systemctl start residencyflow.service
```

### Docker Commands

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View logs for specific service
docker logs residencyflow-api
docker logs residencyflow-frontend -f

# Restart specific service
docker restart residencyflow-api

# Execute command in container
docker exec -it residencyflow-db psql -U residency -d residencyflow
```

### Backup & Restore

```bash
# Manual backup
/usr/local/bin/residencyflow-backup

# Restore from backup
/usr/local/bin/residencyflow-restore

# Backups are stored in
ls /var/backups/residencyflow/
```

Automated backups run daily at 2 AM via cron.

## Troubleshooting

### Service Won't Start

```bash
# Check logs
journalctl -xeu residencyflow.service

# Check docker-compose syntax
cd /opt/residencyflow
docker-compose -f docker-compose.prod.yml config
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker exec residencyflow-db pg_isready -U residency

# Check databases exist
docker exec residencyflow-db psql -U residency -c "\l"

# Manually create databases if needed
docker exec residencyflow-db psql -U residency -d residencyflow -c "CREATE DATABASE prefect;"
docker exec residencyflow-db psql -U residency -d residencyflow -c "CREATE DATABASE keycloak;"
```

### Service-Specific Issues

```bash
# Restart individual services
docker restart residencyflow-api
docker restart residencyflow-prefect
docker restart residencyflow-keycloak

# Check service health
curl http://localhost:8000/docs        # API
curl http://localhost:5173             # Frontend
curl http://localhost:4200/api/health  # Prefect
```

### Clean Reinstall

```bash
# Stop services
systemctl stop residencyflow.service
cd /opt/residencyflow

# Remove containers and volumes
docker-compose -f docker-compose.prod.yml down -v

# Remove data (⚠️ WARNING: This deletes all data!)
docker volume prune -f

# Restart services
systemctl start residencyflow.service
```

## Security Considerations

1. **Firewall**: Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) are exposed
2. **Fail2ban**: Automatically blocks brute-force SSH attacks
3. **Secrets**: All passwords are randomly generated (32+ characters)
4. **User**: Services run as dedicated `residencyflow` user
5. **SSL**: Enable Caddy reverse proxy for HTTPS (requires domain)

### Enable SSL with Caddy

1. Configure domain in DNS
2. Update `/opt/residencyflow/.env.prod` with domain variables
3. Start Caddy: `docker-compose -f docker-compose.prod.yml up -d caddy`
4. Caddy will automatically obtain Let's Encrypt certificates

## Updating ResidencyFlow

```bash
cd /opt/residencyflow

# Pull latest code
git pull origin main

# Rebuild containers (if code changed)
docker-compose -f docker-compose.prod.yml build

# Restart services
systemctl restart residencyflow.service
```

## Monitoring

### Prometheus Metrics
- Access: `http://your-ip:9090`
- View metrics for all services

### Grafana Dashboards
- Access: `http://your-ip:3000`
- Import dashboards from `/monitoring/grafana/dashboards/`

### Logs via Loki
- Centralized logging at `http://your-ip:3100`
- Query logs in Grafana

## Support & Documentation

- **API Documentation**: `http://your-ip:8000/docs`
- **Prefect UI**: `http://your-ip:4200`
- **Repository**: https://github.com/profbiyi/residencyflow
- **Issues**: Create GitHub issues for bugs/features

## License

MIT License - See LICENSE file
