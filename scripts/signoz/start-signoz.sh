#!/bin/bash

# Create network if it doesn't exist
docker network create kafka-network --driver bridge 2>/dev/null || echo "Network kafka-network already exists"

# Start main infrastructure
echo "Starting main infrastructure..."
docker-compose -f docker-compose.yml up -d

# Wait a bit for services to be ready
echo "Waiting for main services to start..."
sleep 10

# Start SigNoz services
echo "Starting SigNoz services..."
docker-compose -f docker-compose.signoz.yml up -d

echo "All services started!"
echo "🎯 Access URLs:"
echo "  • Kafka UI: http://localhost:8080"
echo "  • SigNoz UI: http://localhost:3301" 
echo "  • MongoDB Express: http://localhost:8081"
echo "  • OpenTelemetry Collector: http://localhost:4317 (gRPC), http://localhost:4318 (HTTP)"
