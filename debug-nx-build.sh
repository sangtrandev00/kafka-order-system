#!/bin/bash
# debug-nx-build.sh - Debug script to find where Nx builds output

echo "🔍 Debugging Nx build output location..."

# First, let's build locally to see where files go
echo "Building order-gateway locally..."
npx nx build order-gateway --prod

echo "Checking for build output..."
echo "1. Looking for dist directory:"
ls -la | grep dist || echo "No dist directory found"

echo "2. Looking for any main.js files:"
find . -name "main.js" -type f 2>/dev/null || echo "No main.js files found"

echo "3. Looking for build output directories:"
find . -type d -name "*order-gateway*" 2>/dev/null | grep -v node_modules | grep -v apps/order-gateway/src

echo "4. Checking apps/order-gateway directory structure:"
ls -la apps/order-gateway/

echo "5. Checking if webpack output exists:"
ls -la apps/order-gateway/dist/ 2>/dev/null || echo "No apps/order-gateway/dist directory"

echo "6. Looking for any .js files in dist directories:"
find . -path "*/dist/*" -name "*.js" -type f | head -5

echo "7. Checking nx.json configuration:"
if [ -f "nx.json" ]; then
    echo "Nx workspace configuration found"
    cat nx.json | grep -A 5 -B 5 "outputPath" || echo "No outputPath configuration found"
fi

echo "8. Checking project.json for order-gateway:"
if [ -f "apps/order-gateway/project.json" ]; then
    echo "Project configuration found"
    cat apps/order-gateway/project.json | grep -A 3 -B 3 "outputPath" || echo "No outputPath in project.json"
fi

echo "9. Checking package.json build target:"
if [ -f "apps/order-gateway/package.json" ]; then
    echo "Package.json configuration:"
    cat apps/order-gateway/package.json | grep -A 10 -B 2 "build" || echo "No build configuration in package.json"
fi

echo "🎯 Analysis complete!"

---

#!/bin/bash
# fix-dockerfile-based-on-build.sh - Create correct Dockerfile based on actual build output

echo "🔧 Creating correct Dockerfile based on actual build output..."

# Build first to see where output goes
npx nx build order-gateway --prod

# Find where the main.js actually is
MAIN_JS_PATH=$(find . -name "main.js" -type f -path "*/dist/*" | head -1)

if [ -z "$MAIN_JS_PATH" ]; then
    echo "❌ Could not find main.js in build output"
    echo "Let's check what was actually built:"
    find . -path "*/dist/*" -name "*.js" | head -10
    exit 1
fi

echo "✅ Found main.js at: $MAIN_JS_PATH"

# Extract the directory path
BUILD_OUTPUT_DIR=$(dirname "$MAIN_JS_PATH")
echo "Build output directory: $BUILD_OUTPUT_DIR"

# Create corrected Dockerfile
cat > apps/order-gateway/Dockerfile << EOF
FROM node:20-alpine AS base
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Install dependencies
RUN npm install

FROM base AS build
WORKDIR /app

# Copy source code
COPY . .

# Build the application
RUN npx nx build order-gateway --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \\
    adduser -S nestjs -u 1001

# Copy built application from the correct location
COPY --from=build --chown=nestjs:nodejs $BUILD_OUTPUT_DIR ./

# Copy node_modules
COPY --from=base --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000

CMD ["node", "main.js"]
EOF

echo "✅ Updated Dockerfile with correct build path: $BUILD_OUTPUT_DIR"

# Test the corrected Dockerfile
echo "🧪 Testing corrected Dockerfile..."
eval $(minikube docker-env)
if docker build -f apps/order-gateway/Dockerfile -t test-corrected . > /tmp/corrected-build.log 2>&1; then
    echo "✅ Corrected Dockerfile builds successfully!"
    docker rmi test-corrected > /dev/null 2>&1
else
    echo "❌ Still failing. Check /tmp/corrected-build.log"
    tail -20 /tmp/corrected-build.log
fi

---

#!/bin/bash
# simple-dockerfile-approach.sh - Create simple single-stage Dockerfile

echo "🔄 Creating simple single-stage Dockerfile approach..."

# Create simple Dockerfile for order-gateway
cat > apps/order-gateway/Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Build the application
RUN npx nx build order-gateway --prod

# Find and move to the correct output directory
RUN find /app -name "main.js" -path "*/dist/*" -exec dirname {} \; | head -1 > /tmp/build_path
RUN BUILD_PATH=$(cat /tmp/build_path) && \
    echo "Build output found at: $BUILD_PATH" && \
    cp -r $BUILD_PATH/* /app/ && \
    rm -rf dist apps libs node_modules/.cache

# Reinstall only production dependencies
RUN npm ci --only=production

EXPOSE 3000

CMD ["node", "main.js"]
EOF

echo "✅ Created simple single-stage Dockerfile"

# Test it
echo "🧪 Testing simple Dockerfile..."
eval $(minikube docker-env)
if docker build -f apps/order-gateway/Dockerfile -t test-simple . > /tmp/simple-build.log 2>&1; then
    echo "✅ Simple Dockerfile builds successfully!"
    docker rmi test-simple > /dev/null 2>&1
else
    echo "❌ Simple approach also failed. Check /tmp/simple-build.log"
    tail -20 /tmp/simple-build.log
fi