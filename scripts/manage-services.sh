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
