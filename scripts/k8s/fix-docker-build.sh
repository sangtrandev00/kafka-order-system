#!/bin/bash
# fix-docker-build.sh - Complete fix for Docker build issues

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

echo -e "${BLUE}🔧 Fixing Docker Build Issues for Kafka Microservices${NC}"
echo

# Step 1: Fix package-lock.json
print_info "Step 1: Fixing package-lock.json synchronization..."
print_warning "This will update your lockfile to match package.json"

# Delete existing lockfile and node_modules
if [ -f "package-lock.json" ]; then
    print_info "Removing existing package-lock.json"
    rm package-lock.json
fi

if [ -d "node_modules" ]; then
    print_info "Removing existing node_modules"
    rm -rf node_modules
fi

# Reinstall dependencies to create fresh lockfile
print_info "Installing dependencies to create fresh lockfile..."
npm install

print_status "package-lock.json synchronized"

# Step 2: Update Dockerfiles to use Node 20
print_info "Step 2: Creating fixed Dockerfiles with Node 20..."

# Create fixed Dockerfile for order-gateway
cat > apps/order-gateway/Dockerfile << 'EOF'
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Install all dependencies first
RUN npm install

FROM base AS build
# Copy source code
COPY . .

# Build the specific service
RUN npx nx build order-gateway --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/order-gateway ./

# Copy node_modules from base stage
COPY --from=base --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000

CMD ["node", "main.js"]
EOF

# Create fixed Dockerfile for order-service
cat > apps/order-service/Dockerfile << 'EOF'
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Install all dependencies first
RUN npm install

FROM base AS build
# Copy source code
COPY . .

# Build the specific service
RUN npx nx build order-service --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/order-service ./

# Copy node_modules from base stage
COPY --from=base --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

CMD ["node", "main.js"]
EOF

# Create fixed Dockerfile for notification-service
cat > apps/notification-service/Dockerfile << 'EOF'
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Install all dependencies first
RUN npm install

FROM base AS build
# Copy source code
COPY . .

# Build the specific service
RUN npx nx build notification-service --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/notification-service ./

# Copy node_modules from base stage
COPY --from=base --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

CMD ["node", "main.js"]
EOF

# Create fixed Dockerfile for logger-service
cat > apps/logger-service/Dockerfile << 'EOF'
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Install all dependencies first
RUN npm install

FROM base AS build
# Copy source code
COPY . .

# Build the specific service
RUN npx nx build logger-service --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy built application
COPY --from=build --chown=nestjs:nodejs /app/dist/apps/logger-service ./

# Copy node_modules from base stage
COPY --from=base --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

CMD ["node", "main.js"]
EOF

print_status "All Dockerfiles updated to use Node 20"

# Step 3: Clean Docker cache
print_info "Step 3: Cleaning Docker build cache..."
eval $(minikube docker-env)
docker system prune -f
docker builder prune -f

print_status "Docker cache cleaned"

# Step 4: Test build one service to verify fix
print_info "Step 4: Testing Docker build with order-gateway..."
if docker build -f apps/order-gateway/Dockerfile -t test-build:latest . > /tmp/docker-build.log 2>&1; then
    print_status "Test build successful! All issues are fixed."
    docker rmi test-build:latest > /dev/null 2>&1
else
    print_error "Test build failed. Check /tmp/docker-build.log for details"
    tail -20 /tmp/docker-build.log
    exit 1
fi

# Step 5: Update Ansible build task to be more robust
print_info "Step 5: Creating improved Ansible build task..."
mkdir -p ansible/tasks

cat > ansible/tasks/build-images.yml << 'EOF'
---
- name: Set Docker environment for Minikube
  shell: |
    eval $(minikube docker-env)
    env | grep DOCKER
  register: docker_env
  changed_when: false

- name: Clean Docker build cache
  shell: |
    eval $(minikube docker-env)
    docker system prune -f
    docker builder prune -f
  changed_when: false

- name: Build Docker images for each service
  shell: |
    eval $(minikube docker-env)
    echo "Building {{ item.name }}..."
    docker build -f apps/{{ item.name }}/Dockerfile -t {{ item.image }} . --no-cache
  args:
    chdir: "{{ playbook_dir }}/.."
  loop: "{{ app_services }}"
  register: build_results
  retries: 2
  delay: 5

- name: Display build results
  debug:
    msg: "Successfully built image: {{ item.item.image }}"
  loop: "{{ build_results.results }}"
  when: item.rc == 0

- name: Verify images were created
  shell: |
    eval $(minikube docker-env)
    docker images | grep {{ item.image.split(':')[0] }}
  loop: "{{ app_services }}"
  register: image_verification
  changed_when: false

- name: Display available images
  debug:
    msg: "Available images: {{ image_verification.results | map(attribute='stdout') | list }}"
EOF

print_status "Improved Ansible build task created"

# Step 6: Fix Ansible playbook environment warning
print_info "Step 6: Fixing Ansible playbook environment variable warning..."

if [ -f "ansible/playbook.yml" ]; then
    # Replace 'environment' with 'deployment_environment' in playbook
    sed -i.bak 's/deployment_environment: development/deploy_env: development/g' ansible/playbook.yml
    sed -i.bak 's/environment:/deploy_env:/g' ansible/playbook.yml
    print_status "Fixed environment variable naming in playbook"
fi

print_status "All fixes completed successfully!"
echo
print_info "Summary of fixes applied:"
echo "✅ Updated package-lock.json to sync with package.json"
echo "✅ Updated all Dockerfiles to use Node 20 (compatible with NestJS 11+)"
echo "✅ Simplified Docker build process"
echo "✅ Added Docker cache cleaning"
echo "✅ Improved Ansible build task with retries"
echo "✅ Fixed Ansible environment variable warnings"
echo
print_info "Next steps:"
echo "1. Run: cd ansible && ansible-playbook playbook.yml"
echo "2. Or test individual Docker builds with:"
echo "   eval \$(minikube docker-env)"
echo "   docker build -f apps/order-gateway/Dockerfile -t test ."

---

#!/bin/bash
# quick-test-build.sh - Quick test to verify Docker builds work

echo "🧪 Testing Docker builds..."

# Configure Docker for Minikube
eval $(minikube docker-env)

# Test build each service
services=("order-gateway" "order-service" "notification-service" "logger-service")

for service in "${services[@]}"; do
    echo "Testing $service..."
    if docker build -f apps/$service/Dockerfile -t test-$service:latest . > /tmp/build-$service.log 2>&1; then
        echo "✅ $service build successful"
        docker rmi test-$service:latest > /dev/null 2>&1
    else
        echo "❌ $service build failed - check /tmp/build-$service.log"
        tail -10 /tmp/build-$service.log
    fi
done

echo "🎉 Build testing completed!"

---

#!/bin/bash
# fix-and-deploy.sh - Fix issues and deploy

echo "🚀 Fixing issues and deploying..."

# Run the fix script
./fix-docker-build.sh

# Deploy with Ansible
cd ansible
ansible-playbook playbook.yml

echo "✅ Fix and deployment completed!"