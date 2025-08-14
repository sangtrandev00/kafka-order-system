#!/bin/bash
# final-dockerfile-fix.sh - Replace all Dockerfiles with working versions

echo "🔧 Replacing all Dockerfiles with working versions..."

# Create working Dockerfile for order-gateway
cat > apps/order-gateway/Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the application (outputs to apps/order-gateway/dist/)
RUN npx nx build order-gateway --prod

# Move to the correct build output directory
WORKDIR /app/apps/order-gateway/dist

# Clean up unnecessary files to reduce image size
RUN rm -rf /app/node_modules/.cache /app/.nx

EXPOSE 3000

CMD ["node", "main.js"]
EOF

# Create working Dockerfile for order-service
cat > apps/order-service/Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the application (outputs to apps/order-service/dist/)
RUN npx nx build order-service --prod

# Move to the correct build output directory
WORKDIR /app/apps/order-service/dist

# Clean up unnecessary files to reduce image size
RUN rm -rf /app/node_modules/.cache /app/.nx

CMD ["node", "main.js"]
EOF

# Create working Dockerfile for notification-service
cat > apps/notification-service/Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the application (outputs to apps/notification-service/dist/)
RUN npx nx build notification-service --prod

# Move to the correct build output directory
WORKDIR /app/apps/notification-service/dist

# Clean up unnecessary files to reduce image size
RUN rm -rf /app/node_modules/.cache /app/.nx

CMD ["node", "main.js"]
EOF

# Create working Dockerfile for logger-service
cat > apps/logger-service/Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the application (outputs to apps/logger-service/dist/)
RUN npx nx build logger-service --prod

# Move to the correct build output directory
WORKDIR /app/apps/logger-service/dist

# Clean up unnecessary files to reduce image size
RUN rm -rf /app/node_modules/.cache /app/.nx

CMD ["node", "main.js"]
EOF

echo "✅ All Dockerfiles updated with working configurations"

# Test build all services
echo "🧪 Testing all Dockerfiles..."
eval $(minikube docker-env)

services=("order-gateway" "order-service" "notification-service" "logger-service")
failed_services=()

for service in "${services[@]}"; do
    echo "Testing $service..."
    if docker build -f apps/$service/Dockerfile -t kafka-microservices/$service:latest . > /tmp/build-$service.log 2>&1; then
        echo "✅ $service build successful"
    else
        echo "❌ $service build failed"
        failed_services+=($service)
        echo "Error log for $service:"
        tail -10 /tmp/build-$service.log
    fi
done

if [ ${#failed_services[@]} -eq 0 ]; then
    echo "🎉 All services built successfully!"
    echo "Ready to deploy with Ansible!"
    echo ""
    echo "Next steps:"
    echo "cd ansible"
    echo "ansible-playbook playbook.yml"
else
    echo "❌ Some services failed to build: ${failed_services[*]}"
    echo "Check the error logs above"
fi

---

#!/bin/bash
# test-and-deploy.sh - Test builds and deploy

echo "🚀 Testing builds and deploying..."

# Run the fix
./final-dockerfile-fix.sh

# If builds successful, deploy
if [ $? -eq 0 ]; then
    echo "✅ All builds successful, proceeding with deployment..."
    cd ansible
    ansible-playbook playbook.yml
else
    echo "❌ Build failures detected, stopping deployment"
    exit 1
fi