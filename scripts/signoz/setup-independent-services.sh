#!/bin/bash
# setup-independent-services.sh - Complete setup for independent Docker services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo -e "${BLUE}🚀 Setting up Independent Docker Services${NC}"
echo "=================================================="

# Step 1: Check Docker
print_info "Step 1: Checking Docker installation..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running"
    exit 1
fi

print_status "Docker is ready"

# Step 2: Clean up any existing setup
print_info "Step 2: Cleaning up existing setup..."

# Stop any running containers
docker-compose -f docker-compose.yml down 2>/dev/null || true
docker-compose -f docker-compose.signoz.yml down 2>/dev/null || true
docker-compose -f docker-compose.services.yml down 2>/dev/null || true
docker-compose -f docker-compose.logging.yml down 2>/dev/null || true

# Remove old networks
docker network rm kafka-network 2>/dev/null || true
docker network rm kafka-main-network 2>/dev/null || true
docker network rm signoz-logging-network 2>/dev/null || true

print_status "Cleanup completed"

# Step 3: Create directories
print_info "Step 3: Creating configuration directories..."

mkdir -p deploy/signoz
mkdir -p scripts

print_status "Directories created"

# Step 4: Create ClickHouse configuration files
print_info "Step 4: Creating ClickHouse configuration..."

cat > deploy/signoz/clickhouse-config.xml << 'EOF'
<?xml version="1.0"?>
<clickhouse>
    <logger>
        <level>warning</level>
        <console>true</console>
    </logger>

    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <interserver_http_port>9009</interserver_http_port>

    <listen_host>0.0.0.0</listen_host>

    <max_connections>2048</max_connections>
    <keep_alive_timeout>3</keep_alive_timeout>
    <max_concurrent_queries>100</max_concurrent_queries>

    <path>/var/lib/clickhouse/</path>
    <tmp_path>/var/lib/clickhouse/tmp/</tmp_path>
    <user_files_path>/var/lib/clickhouse/user_files/</user_files_path>

    <users_config>users.xml</users_config>
    <default_profile>default</default_profile>
    <default_database>default</default_database>

    <timezone>UTC</timezone>

    <remote_servers>
        <cluster>
            <shard>
                <replica>
                    <host>logging-clickhouse</host>
                    <port>9000</port>
                </replica>
            </shard>
        </cluster>
    </remote_servers>

    <macros>
        <cluster>cluster</cluster>
        <shard>01</shard>
        <replica>replica_1</replica>
    </macros>
</clickhouse>
EOF

cat > deploy/signoz/users.xml << 'EOF'
<?xml version="1.0"?>
<clickhouse>
    <users>
        <default>
            <password></password>
            <networks>
                <ip>::/0</ip>
            </networks>
            <profile>default</profile>
            <quota>default</quota>
            <access_management>1</access_management>
            <named_collection_control>1</named_collection_control>
            <show_named_collections>1</show_named_collections>
            <show_named_collections_secrets>1</show_named_collections_secrets>
        </default>
    </users>

    <profiles>
        <default>
            <max_memory_usage>10000000000</max_memory_usage>
            <use_uncompressed_cache>0</use_uncompressed_cache>
            <load_balancing>random</load_balancing>
            <max_partitions_per_insert_block>100</max_partitions_per_insert_block>
        </default>
    </profiles>

    <quotas>
        <default>
            <interval>
                <duration>3600</duration>
                <queries>0</queries>
                <errors>0</errors>
                <result_rows>0</result_rows>
                <read_rows>0</read_rows>
                <execution_time>0</execution_time>
            </interval>
        </default>
    </quotas>
</clickhouse>
EOF

cat > deploy/signoz/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'signoz'
    static_configs:
      - targets: ['localhost:8080']

  - job_name: 'otel-collector'
    static_configs:
      - targets: ['logging-otel-collector:8888']

  - job_name: 'clickhouse'
    static_configs:
      - targets: ['logging-clickhouse:8123']
EOF

# Copy the OTEL collector config from the artifact
cat > deploy/signoz/otel-collector-config.yaml << 'EOF'
# deploy/signoz/otel-collector-config.yaml - Independent configuration
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
        max_recv_msg_size: 4194304
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - http://localhost:3000
            - http://localhost:3001
            - http://localhost:3002
            - http://localhost:3003
            - http://localhost:3004
            - http://localhost:3005
            - http://localhost:8080
            - "*"  # Allow all for development

  # Prometheus scraper for metrics
  prometheus:
    config:
      scrape_configs:
        - job_name: 'otel-collector'
          static_configs:
            - targets: ['localhost:8888']

processors:
  # Memory limiter to prevent OOM
  memory_limiter:
    limit_mib: 1000
    spike_limit_mib: 200
    check_interval: 1s

  # Batch processor for efficiency
  batch:
    timeout: 2s
    send_batch_size: 1024
    send_batch_max_size: 2048

  # Resource processor to add metadata
  resource/signoz:
    attributes:
      - key: signoz.collector.name
        value: "independent-otel-collector"
        action: insert
      - key: deployment.environment
        value: "development"
        action: insert
      - key: service.namespace
        value: "kafka-microservices"
        action: insert

  # Resource detection for automatic metadata
  resourcedetection:
    detectors: [env, system, docker]
    timeout: 5s
    override: false

exporters:
  # ClickHouse exporter for all telemetry data
  clickhouse:
    endpoint: tcp://logging-clickhouse:9000/default
    username: default
    password: ""
    database: default
    ttl: 72h
    traces_table_name: signoz_traces
    metrics_table_name: signoz_metrics  
    logs_table_name: signoz_logs
    timeout: 10s
    retry_on_failure:
      enabled: true
      initial_interval: 2s
      max_interval: 60s
      max_elapsed_time: 300s
      multiplier: 2

  # Logging exporter for debugging
  logging:
    loglevel: info
    sampling_initial: 5
    sampling_thereafter: 200

  # Prometheus exporter for real-time metrics
  prometheus:
    endpoint: "0.0.0.0:8888"
    const_labels:
      collector: "signoz-otel-collector"
      environment: "development"

extensions:
  # Health check extension
  health_check:
    endpoint: 0.0.0.0:13133

  # Performance profiling
  pprof:
    endpoint: 0.0.0.0:1777

  # zPages for debugging
  zpages:
    endpoint: 0.0.0.0:55679

service:
  extensions: [health_check, pprof, zpages]
  
  pipelines:
    # Traces pipeline
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, resource/signoz, batch]
      exporters: [clickhouse, logging]

    # Metrics pipeline  
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, resourcedetection, resource/signoz, batch]
      exporters: [clickhouse, prometheus, logging]

    # Logs pipeline
    logs:
      receivers: [otlp]
      processors: [memory_limiter, resourcedetection, resource/signoz, batch]
      exporters: [clickhouse, logging]

  # Telemetry configuration for the collector itself
  telemetry:
    logs:
      level: "info"
    metrics:
      address: "0.0.0.0:8888"
EOF

print_status "Configuration files created"

# Step 5: Copy the management script
print_info "Step 5: Creating management script..."

# The manage-services.sh script is already created in the artifact above
# We'll create a simple version here for the setup

cat > scripts/manage-services.sh << 'EOF'
#!/bin/bash
# Quick service manager

case "$1" in
    "start-main")
        echo "Starting main services..."
        docker-compose -f docker-compose.services.yml up -d
        ;;
    "start-logging")
        echo "Starting logging services..."
        docker-compose -f docker-compose.logging.yml up -d
        ;;
    "start-all")
        echo "Starting all services..."
        docker-compose -f docker-compose.services.yml up -d
        sleep 10
        docker-compose -f docker-compose.logging.yml up -d
        ;;
    "stop")
        echo "Stopping all services..."
        docker-compose -f docker-compose.logging.yml down
        docker-compose -f docker-compose.services.yml down
        ;;
    "status")
        echo "=== Main Services ==="
        docker-compose -f docker-compose.services.yml ps
        echo "=== Logging Services ==="
        docker-compose -f docker-compose.logging.yml ps
        ;;
    *)
        echo "Usage: $0 {start-main|start-logging|start-all|stop|status}"
        ;;
esac
EOF

chmod +x scripts/manage-services.sh

print_status "Management script created"

# Step 6: Create environment file for microservices
print_info "Step 6: Creating environment configuration..."

cat > .env.independent << 'EOF'
# Independent services configuration

# Database Configuration (Main Stack)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=orders_db

# MongoDB Configuration (Main Stack)
MONGODB_URI=mongodb://admin:admin123@localhost:27017/kafka_microservices?authSource=admin&directConnection=true
MONGODB_DATABASE=kafka_microservices

# Kafka Configuration (Main Stack)
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=kafka-microservices

# Service Ports
ORDER_GATEWAY_PORT=3001
ORDER_SERVICE_PORT=3002
NOTIFICATION_SERVICE_PORT=3003
LOGGER_SERVICE_PORT=3004
UPLOAD_SERVICE_PORT=3005

# Service URLs (for HTTP communication)
UPLOAD_SERVICE_URL=http://localhost:3005/api

# AWS S3 Configuration (LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=kafka-microservices-uploads
S3_ENDPOINT=http://localhost:4566

# ===== SigNoz Configuration (Independent Stack) =====
SIGNOZ_ENABLED=true
SIGNOZ_ENDPOINT=http://localhost:4318
SIGNOZ_LOGS_ENDPOINT=http://localhost:4318/v1/logs
SIGNOZ_ACCESS_TOKEN=

# Service Configuration
SERVICE_VERSION=1.0.0
LOG_LEVEL=info
EOF

print_status "Environment configuration created"

# Step 7: Update package.json scripts
print_info "Step 7: Creating helper scripts..."

cat > start-independent.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Independent Docker Services"
echo "======================================"

echo "Starting main business services..."
docker-compose -f docker-compose.services.yml up -d

echo "Waiting for main services to be ready..."
sleep 15

echo "Starting logging services..."
docker-compose -f docker-compose.logging.yml up -d

echo "All services started!"
echo ""
echo "🎯 Access URLs:"
echo "Main Services:"
echo "  • Kafka UI: http://localhost:8080"
echo "  • MongoDB Express: http://localhost:8081"
echo ""
echo "Logging Services:"  
echo "  • SigNoz Dashboard: http://localhost:3301"
echo "  • OTEL Collector gRPC: localhost:4317"
echo "  • OTEL Collector HTTP: localhost:4318"
echo ""
echo "📊 To start your microservices with telemetry:"
echo "  export SIGNOZ_ENABLED=true"
echo "  npm run dev:all"
EOF

chmod +x start-independent.sh

cat > stop-independent.sh << 'EOF'
#!/bin/bash
echo "Stopping all independent services..."
docker-compose -f docker-compose.logging.yml down
docker-compose -f docker-compose.services.yml down
echo "All services stopped"
EOF

chmod +x stop-independent.sh

print_status "Helper scripts created"

# Step 8: Display summary
print_status "Setup completed successfully!"
echo
echo "📁 Files created:"
echo "  • docker-compose.services.yml    - Main business services"
echo "  • docker-compose.logging.yml     - Logging and observability"
echo "  • deploy/signoz/*                - SigNoz configuration files"
echo "  • .env.independent                - Environment variables"
echo "  • start-independent.sh            - Quick start script"
echo "  • stop-independent.sh             - Quick stop script"
echo
echo "🚀 Quick start:"
echo "  ./start-independent.sh"
echo
echo "🛠️ Individual control:"
echo "  docker-compose -f docker-compose.services.yml up -d    # Main services only"
echo "  docker-compose -f docker-compose.logging.yml up -d     # Logging only"
echo
echo "📊 Access URLs (after starting):"
echo "  • Kafka UI: http://localhost:8080"
echo "  • SigNoz Dashboard: http://localhost:3301" 
echo "  • MongoDB Express: http://localhost:8081"
echo
echo "✅ Ready to use independent Docker services!"