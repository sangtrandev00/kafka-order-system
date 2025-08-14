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
