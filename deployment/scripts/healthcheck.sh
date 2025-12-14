#!/bin/bash
set -euo pipefail

# ResidencyFlow Health Check & Auto-Recovery Script
# Monitors all services and attempts automatic recovery

HEALTH_CHECK_INTERVAL=60  # seconds
MAX_RESTART_ATTEMPTS=3
ALERT_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/residencyflow/healthcheck.log
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a /var/log/residencyflow/healthcheck.log
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a /var/log/residencyflow/healthcheck.log
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}" | tee -a /var/log/residencyflow/healthcheck.log
}

# Send alert notification
send_alert() {
    local service=$1
    local status=$2
    local message=$3
    
    if [ -n "$ALERT_WEBHOOK" ]; then
        local color="danger"
        local emoji="🔴"
        
        if [ "$status" = "recovered" ]; then
            color="good"
            emoji="✅"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"$emoji ResidencyFlow: $service\",
                    \"text\": \"$message\",
                    \"footer\": \"$(hostname)\",
                    \"ts\": $(date +%s)
                }]
            }" \
            "$ALERT_WEBHOOK" 2>/dev/null || true
    fi
}

# Check if service is healthy
check_service() {
    local name=$1
    local url=$2
    local timeout=${3:-5}
    
    if curl -sf --max-time "$timeout" "$url" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check Docker container
check_container() {
    local container=$1
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        # Container exists and running
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
        if [ "$status" = "healthy" ] || [ "$status" = "unknown" ]; then
            return 0
        fi
    fi
    return 1
}

# Restart container
restart_container() {
    local container=$1
    log "Restarting container: $container"
    docker restart "$container" || return 1
    sleep 10
    return 0
}

# Restart entire stack
restart_stack() {
    log "Restarting entire ResidencyFlow stack..."
    systemctl restart residencyflow.service || return 1
    sleep 30
    return 0
}

# Main health check
declare -A failure_counts
declare -A last_alert_times

health_check() {
    local all_healthy=true
    
    # Service definitions: name|url|container|critical
    local services=(
        "API|http://localhost:8000/health|residencyflow-api-1|true"
        "Prefect|http://localhost:4200/api/health|residencyflow-prefect-1|true"
        "PostgreSQL|http://localhost:5432|residencyflow-postgres-1|true"
        "Redis|http://localhost:6379|residencyflow-redis-1|true"
        "MinIO|http://localhost:9000/minio/health/live|residencyflow-minio-1|true"
        "Keycloak|http://localhost:8080/health|residencyflow-keycloak-1|false"
        "Grafana|http://localhost:3001/api/health|residencyflow-grafana-1|false"
        "Prometheus|http://localhost:9090/-/healthy|residencyflow-prometheus-1|false"
        "Loki|http://localhost:3100/ready|residencyflow-loki-1|false"
        "Caddy|http://localhost:80|residencyflow-caddy-1|true"
    )
    
    for service_def in "${services[@]}"; do
        IFS='|' read -r name url container critical <<< "$service_def"
        
        # Initialize failure count if not exists
        if [ -z "${failure_counts[$name]:-}" ]; then
            failure_counts[$name]=0
        fi
        
        # Check service health
        if check_service "$name" "$url" 5 || check_container "$container"; then
            # Service is healthy
            if [ "${failure_counts[$name]}" -gt 0 ]; then
                # Service recovered
                success "$name recovered after ${failure_counts[$name]} failures"
                send_alert "$name" "recovered" "Service has recovered and is now healthy"
                failure_counts[$name]=0
            fi
        else
            # Service is unhealthy
            failure_counts[$name]=$((failure_counts[$name] + 1))
            error "$name is unhealthy (failure count: ${failure_counts[$name]})"
            all_healthy=false
            
            # Alert threshold (alert after 2 consecutive failures)
            if [ "${failure_counts[$name]}" -eq 2 ]; then
                send_alert "$name" "down" "Service is unhealthy after ${failure_counts[$name]} checks"
            fi
            
            # Auto-recovery attempt
            if [ "${failure_counts[$name]}" -ge 2 ] && [ "${failure_counts[$name]}" -le "$MAX_RESTART_ATTEMPTS" ]; then
                warn "Attempting auto-recovery for $name (attempt ${failure_counts[$name]}/$MAX_RESTART_ATTEMPTS)"
                
                if restart_container "$container"; then
                    log "Container $container restarted successfully"
                    sleep 15
                    
                    # Verify recovery
                    if check_service "$name" "$url" 10 || check_container "$container"; then
                        success "$name recovered after restart"
                        send_alert "$name" "recovered" "Service recovered after container restart"
                        failure_counts[$name]=0
                    fi
                else
                    error "Failed to restart container $container"
                fi
            fi
            
            # If critical service failed multiple times, restart entire stack
            if [ "$critical" = "true" ] && [ "${failure_counts[$name]}" -gt "$MAX_RESTART_ATTEMPTS" ]; then
                error "Critical service $name failed $MAX_RESTART_ATTEMPTS times. Restarting entire stack."
                send_alert "CRITICAL" "down" "Critical service $name failed. Restarting entire platform."
                
                if restart_stack; then
                    log "Stack restarted successfully"
                    # Reset all failure counts
                    for key in "${!failure_counts[@]}"; do
                        failure_counts[$key]=0
                    done
                else
                    error "Failed to restart stack. Manual intervention required!"
                    send_alert "CRITICAL" "down" "Failed to restart platform. Manual intervention required!"
                fi
            fi
        fi
    done
    
    # Check disk space
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 90 ]; then
        error "Disk usage critical: ${disk_usage}%"
        send_alert "Disk Space" "critical" "Disk usage is at ${disk_usage}%"
    elif [ "$disk_usage" -gt 80 ]; then
        warn "Disk usage high: ${disk_usage}%"
    fi
    
    # Check memory
    local mem_usage=$(free | awk 'NR==2 {printf "%.0f", $3/$2 * 100}')
    if [ "$mem_usage" -gt 95 ]; then
        error "Memory usage critical: ${mem_usage}%"
        send_alert "Memory" "critical" "Memory usage is at ${mem_usage}%"
    elif [ "$mem_usage" -gt 85 ]; then
        warn "Memory usage high: ${mem_usage}%"
    fi
    
    # Overall status
    if [ "$all_healthy" = true ]; then
        log "All services healthy ✅"
        return 0
    else
        warn "Some services are unhealthy"
        return 1
    fi
}

# Status report
status_report() {
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  ResidencyFlow Health Status Report"
    echo "  $(date)"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    
    # Service status
    echo "Services:"
    local services=(
        "API|http://localhost:8000/health"
        "Prefect|http://localhost:4200/api/health"
        "PostgreSQL|localhost:5432"
        "Redis|localhost:6379"
        "MinIO|http://localhost:9000/minio/health/live"
        "Keycloak|http://localhost:8080/health"
        "Grafana|http://localhost:3001/api/health"
        "Prometheus|http://localhost:9090/-/healthy"
    )
    
    for service_def in "${services[@]}"; do
        IFS='|' read -r name url <<< "$service_def"
        if check_service "$name" "$url" 3; then
            echo "  ✅ $name"
        else
            echo "  ❌ $name"
        fi
    done
    
    echo ""
    echo "System Resources:"
    echo "  CPU:    $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)% used"
    echo "  Memory: $(free | awk 'NR==2 {printf "%.1f%%", $3/$2 * 100}')"
    echo "  Disk:   $(df -h / | awk 'NR==2 {print $5}')"
    
    echo ""
    echo "Docker Containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.State}}" | grep residencyflow || echo "  No containers running"
    
    echo ""
    echo "Recent Errors (last 10):"
    journalctl -u residencyflow.service --no-pager -n 10 -p err || echo "  No recent errors"
    
    echo ""
    echo "═══════════════════════════════════════════════════════"
}

# Usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  monitor     Start continuous monitoring (default)"
    echo "  check       Run single health check"
    echo "  status      Show detailed status report"
    echo "  restart     Restart all services"
    echo ""
    exit 1
}

# Main
case "${1:-monitor}" in
    monitor)
        log "Starting health monitoring (interval: ${HEALTH_CHECK_INTERVAL}s)..."
        while true; do
            health_check
            sleep "$HEALTH_CHECK_INTERVAL"
        done
        ;;
    check)
        health_check
        ;;
    status)
        status_report
        ;;
    restart)
        restart_stack
        ;;
    *)
        usage
        ;;
esac
