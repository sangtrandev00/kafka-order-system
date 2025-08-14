#!/bin/bash
echo "Stopping all independent services..."
docker-compose -f docker-compose.logging.yml down
docker-compose -f docker-compose.services.yml down
echo "All services stopped"
