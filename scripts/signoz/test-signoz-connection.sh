# Test script:
#!/bin/bash
# test-signoz-connection.sh

echo "🧪 Testing SigNoz Connection..."

# Test from host
echo "1. Testing from host:"
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

# Test from container (if running in Docker)
echo "2. Testing from container network:"
docker run --rm --network signoz-net curlimages/curl:latest \
  -X POST http://signoz-otel-collector:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

echo "3. Check SigNoz frontend:"
curl -s http://localhost:8080/api/v1/health