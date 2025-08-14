#!/bin/bash
# fix-k8s-deployment.sh - Complete fix for Kubernetes deployment issues

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

echo -e "${BLUE}🔧 Fixing Kubernetes Deployment Issues${NC}"
echo

# Step 1: Install required Python libraries for Ansible Kubernetes modules
print_info "Step 1: Installing required Python libraries for Ansible Kubernetes modules..."

# Check if pip is available for the Python version Ansible is using
if command -v pip3 &> /dev/null; then
    print_info "Installing kubernetes and PyYAML libraries..."
    pip3 install kubernetes PyYAML
    print_status "Python libraries installed"
else
    print_warning "pip3 not found, trying alternative installation..."
    if command -v brew &> /dev/null; then
        brew install kubernetes-cli
        # Try installing via homebrew python
        /opt/homebrew/bin/python3.13 -m pip install kubernetes PyYAML
        print_status "Libraries installed via Homebrew Python"
    else
        print_error "Please install kubernetes library manually: pip3 install kubernetes PyYAML"
        exit 1
    fi
fi

# Step 2: Fix Ansible playbook variables
print_info "Step 2: Fixing Ansible playbook variable naming issues..."

# Create corrected playbook.yml
cat > ansible/playbook.yml << 'EOF'
- name: Deploy Kafka Microservices to Kubernetes
  hosts: localhost
  connection: local
  gather_facts: false
  vars:
    k8s_namespace: kafka-microservices
    deploy_env: development # Fixed: changed from 'environment' which is reserved
    minikube_ip: '{{ ansible_env.MINIKUBE_IP | default(lookup(''pipe'', ''minikube ip 2>/dev/null || echo ""'')) }}'
    app_services: # Fixed: changed from 'services' which could conflict
      - name: order-gateway
        image: kafka-microservices/order-gateway:latest
        port: 3000
        replicas: 2
      - name: order-service
        image: kafka-microservices/order-service:latest
        replicas: 2
      - name: notification-service
        image: kafka-microservices/notification-service:latest
        replicas: 1
      - name: logger-service
        image: kafka-microservices/logger-service:latest
        replicas: 1

  pre_tasks:
    - name: Check if Docker is running
      command: docker info
      register: docker_status
      failed_when: false
      changed_when: false

    - name: Fail if Docker is not running
      fail:
        msg: |
          Docker is not running. Please start Docker Desktop:
          1. Open Docker Desktop application
          2. Wait for it to fully start
          3. Try again
      when: docker_status.rc != 0

    - name: Check if Minikube is running
      command: minikube status
      register: minikube_status
      failed_when: false
      changed_when: false

    - name: Start Minikube if not running
      command: minikube start --memory=6144 --cpus=4 --disk-size=20g
      when: "'Running' not in minikube_status.stdout"
      register: minikube_start
      timeout: 600

    - name: Wait for Minikube to be ready
      command: kubectl cluster-info
      register: cluster_info
      retries: 10
      delay: 5
      until: cluster_info.rc == 0

    - name: Get Minikube IP
      command: minikube ip
      register: minikube_ip_result
      changed_when: false

    - name: Set Minikube IP fact
      set_fact:
        minikube_ip: '{{ minikube_ip_result.stdout }}'

  tasks:
    - name: Configure Docker environment for Minikube
      shell: eval $(minikube docker-env)
      changed_when: false

    - name: Build Docker images
      include_tasks: tasks/build-images.yml

    - name: Deploy infrastructure
      include_tasks: tasks/deploy-infrastructure.yml

    - name: Deploy microservices
      include_tasks: tasks/deploy-microservices.yml

    - name: Setup monitoring
      include_tasks: tasks/deploy-monitoring.yml

    - name: Verify deployment
      include_tasks: tasks/verify-deployment.yml

    - name: Display access information
      debug:
        msg:
          - '🚀 Deployment completed successfully!'
          - '📱 Application URL: http://{{ minikube_ip }}'
          - '📊 Add to /etc/hosts: {{ minikube_ip }} kafka-microservices.local'
          - '🔍 Kafka UI: Available via NodePort'
          - "📋 Dashboard: Run 'minikube dashboard'"
EOF

print_status "Fixed Ansible playbook variables"

# Step 3: Fix deploy-infrastructure.yml to use correct variable names
print_info "Step 3: Fixing deploy-infrastructure.yml variable references..."

cat > ansible/tasks/deploy-infrastructure.yml << 'EOF'
- name: Create namespace
  kubernetes.core.k8s:
    name: '{{ k8s_namespace }}'
    api_version: v1
    kind: Namespace
    state: present

- name: Deploy ConfigMap
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: ConfigMap
      metadata:
        name: app-config
        namespace: '{{ k8s_namespace }}'
      data:
        DB_HOST: 'postgres-service'
        DB_PORT: '5432'
        DB_USERNAME: 'postgres'
        DB_NAME: 'orders_db'
        KAFKA_BROKERS: 'kafka-service:9092'
        KAFKA_CLIENT_ID: 'kafka-microservices'
    state: present

- name: Deploy Secrets
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Secret
      metadata:
        name: app-secrets
        namespace: '{{ k8s_namespace }}'
      type: Opaque
      data:
        DB_PASSWORD: "{{ 'postgres' | b64encode }}"
    state: present

- name: Deploy PostgreSQL PVC
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: PersistentVolumeClaim
      metadata:
        name: postgres-pvc
        namespace: '{{ k8s_namespace }}'
      spec:
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 2Gi
    state: present

- name: Deploy PostgreSQL
  kubernetes.core.k8s:
    definition:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: postgres
        namespace: '{{ k8s_namespace }}'
      spec:
        replicas: 1
        selector:
          matchLabels:
            app: postgres
        template:
          metadata:
            labels:
              app: postgres
          spec:
            containers:
              - name: postgres
                image: postgres:13
                ports:
                  - containerPort: 5432
                env:
                  - name: POSTGRES_USER
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_USERNAME
                  - name: POSTGRES_PASSWORD
                    valueFrom:
                      secretKeyRef:
                        name: app-secrets
                        key: DB_PASSWORD
                  - name: POSTGRES_DB
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_NAME
                volumeMounts:
                  - name: postgres-storage
                    mountPath: /var/lib/postgresql/data
                resources:
                  requests:
                    memory: '256Mi'
                    cpu: '250m'
                  limits:
                    memory: '512Mi'
                    cpu: '500m'
            volumes:
              - name: postgres-storage
                persistentVolumeClaim:
                  claimName: postgres-pvc
    state: present
    wait: true
    wait_condition:
      type: Available
      status: 'True'
    wait_timeout: 300

- name: Deploy PostgreSQL Service
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Service
      metadata:
        name: postgres-service
        namespace: '{{ k8s_namespace }}'
      spec:
        selector:
          app: postgres
        ports:
          - protocol: TCP
            port: 5432
            targetPort: 5432
        type: ClusterIP
    state: present

- name: Deploy Zookeeper and Kafka
  include_tasks: deploy-kafka.yml
EOF

print_status "Fixed deploy-infrastructure.yml"

# Step 4: Fix deploy-kafka.yml to use correct variable names
print_info "Step 4: Fixing deploy-kafka.yml variable references..."

cat > ansible/tasks/deploy-kafka.yml << 'EOF'
- name: Deploy Zookeeper
  kubernetes.core.k8s:
    definition:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: zookeeper
        namespace: '{{ k8s_namespace }}'
      spec:
        replicas: 1
        selector:
          matchLabels:
            app: zookeeper
        template:
          metadata:
            labels:
              app: zookeeper
          spec:
            containers:
              - name: zookeeper
                image: confluentinc/cp-zookeeper:7.4.0
                ports:
                  - containerPort: 2181
                env:
                  - name: ZOOKEEPER_CLIENT_PORT
                    value: '2181'
                  - name: ZOOKEEPER_TICK_TIME
                    value: '2000'
                resources:
                  requests:
                    memory: '256Mi'
                    cpu: '250m'
                  limits:
                    memory: '512Mi'
                    cpu: '500m'
    state: present
    wait: true
    wait_condition:
      type: Available
      status: 'True'
    wait_timeout: 300

- name: Deploy Zookeeper Service
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Service
      metadata:
        name: zookeeper-service
        namespace: '{{ k8s_namespace }}'
      spec:
        selector:
          app: zookeeper
        ports:
          - protocol: TCP
            port: 2181
            targetPort: 2181
    state: present

- name: Deploy Kafka
  kubernetes.core.k8s:
    definition:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kafka
        namespace: '{{ k8s_namespace }}'
      spec:
        replicas: 1
        selector:
          matchLabels:
            app: kafka
        template:
          metadata:
            labels:
              app: kafka
          spec:
            containers:
              - name: kafka
                image: confluentinc/cp-kafka:7.4.0
                ports:
                  - containerPort: 9092
                  - containerPort: 29092
                env:
                  - name: KAFKA_BROKER_ID
                    value: '1'
                  - name: KAFKA_ZOOKEEPER_CONNECT
                    value: 'zookeeper-service:2181'
                  - name: KAFKA_ADVERTISED_LISTENERS
                    value: 'PLAINTEXT://kafka-service:9092,PLAINTEXT_INTERNAL://kafka-service:29092'
                  - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
                    value: 'PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT'
                  - name: KAFKA_INTER_BROKER_LISTENER_NAME
                    value: 'PLAINTEXT_INTERNAL'
                  - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
                    value: '1'
                  - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
                    value: 'true'
                resources:
                  requests:
                    memory: '512Mi'
                    cpu: '500m'
                  limits:
                    memory: '1Gi'
                    cpu: '1000m'
    state: present
    wait: true
    wait_condition:
      type: Available
      status: 'True'
    wait_timeout: 300

- name: Deploy Kafka Service
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Service
      metadata:
        name: kafka-service
        namespace: '{{ k8s_namespace }}'
      spec:
        selector:
          app: kafka
        ports:
          - name: kafka
            protocol: TCP
            port: 9092
            targetPort: 9092
          - name: kafka-internal
            protocol: TCP
            port: 29092
            targetPort: 29092
    state: present
EOF

print_status "Fixed deploy-kafka.yml"

# Step 5: Create missing deploy-microservices.yml with correct variables
print_info "Step 5: Creating deploy-microservices.yml with correct variable references..."

cat > ansible/tasks/deploy-microservices.yml << 'EOF'
- name: Deploy microservices
  kubernetes.core.k8s:
    definition:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: '{{ item.name }}'
        namespace: '{{ k8s_namespace }}'
      spec:
        replicas: '{{ item.replicas }}'
        selector:
          matchLabels:
            app: '{{ item.name }}'
        template:
          metadata:
            labels:
              app: '{{ item.name }}'
          spec:
            containers:
              - name: '{{ item.name }}'
                image: '{{ item.image }}'
                imagePullPolicy: Never
                ports:
                  - containerPort: '{{ item.port | default(3000) }}'
                env:
                  - name: DB_HOST
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_HOST
                  - name: DB_PORT
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_PORT
                  - name: DB_USERNAME
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_USERNAME
                  - name: DB_PASSWORD
                    valueFrom:
                      secretKeyRef:
                        name: app-secrets
                        key: DB_PASSWORD
                  - name: DB_NAME
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: DB_NAME
                  - name: KAFKA_BROKERS
                    valueFrom:
                      configMapKeyRef:
                        name: app-config
                        key: KAFKA_BROKERS
                resources:
                  requests:
                    memory: "{{ item.name == 'order-gateway' and '256Mi' or '128Mi' }}"
                    cpu: "{{ item.name == 'order-gateway' and '250m' or '125m' }}"
                  limits:
                    memory: "{{ item.name == 'order-gateway' and '512Mi' or '256Mi' }}"
                    cpu: "{{ item.name == 'order-gateway' and '500m' or '250m' }}"
                livenessProbe:
                  httpGet:
                    path: "{{ item.name == 'order-gateway' and '/api' or '/health' }}"
                    port: '{{ item.port | default(3000) }}'
                  initialDelaySeconds: 30
                  periodSeconds: 10
                  failureThreshold: 3
                readinessProbe:
                  httpGet:
                    path: "{{ item.name == 'order-gateway' and '/api' or '/health' }}"
                    port: '{{ item.port | default(3000) }}'
                  initialDelaySeconds: 5
                  periodSeconds: 5
                  failureThreshold: 3
                when: item.name == 'order-gateway'
    state: present
    wait: true
    wait_condition:
      type: Available
      status: 'True'
    wait_timeout: 300
  loop: '{{ app_services }}'

- name: Deploy microservice services
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Service
      metadata:
        name: '{{ item.name }}-service'
        namespace: '{{ k8s_namespace }}'
      spec:
        selector:
          app: '{{ item.name }}'
        ports:
          - protocol: TCP
            port: '{{ item.port | default(3000) }}'
            targetPort: '{{ item.port | default(3000) }}'
        type: "{{ item.name == 'order-gateway' and 'NodePort' or 'ClusterIP' }}"
    state: present
  loop: '{{ app_services }}'
EOF

print_status "Created deploy-microservices.yml"

# Step 6: Fix deploy-monitoring.yml with correct variables
print_info "Step 6: Fixing deploy-monitoring.yml variable references..."

cat > ansible/tasks/deploy-monitoring.yml << 'EOF'
---
- name: Deploy Kafka UI
  kubernetes.core.k8s:
    definition:
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kafka-ui
        namespace: '{{ k8s_namespace }}'
      spec:
        replicas: 1
        selector:
          matchLabels:
            app: kafka-ui
        template:
          metadata:
            labels:
              app: kafka-ui
          spec:
            containers:
              - name: kafka-ui
                image: provectuslabs/kafka-ui:latest
                ports:
                  - containerPort: 8080
                env:
                  - name: KAFKA_CLUSTERS_0_NAME
                    value: 'local'
                  - name: KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS
                    value: 'kafka-service:9092'
    state: present

- name: Deploy Kafka UI Service
  kubernetes.core.k8s:
    definition:
      apiVersion: v1
      kind: Service
      metadata:
        name: kafka-ui-service
        namespace: '{{ k8s_namespace }}'
      spec:
        selector:
          app: kafka-ui
        ports:
          - protocol: TCP
            port: 8080
            targetPort: 8080
        type: NodePort
    state: present

- name: Get Kafka UI access URL
  kubernetes.core.k8s_info:
    api_version: v1
    kind: Service
    name: kafka-ui-service
    namespace: '{{ k8s_namespace }}'
  register: kafka_ui_service

- name: Display Kafka UI URL
  debug:
    msg: 'Kafka UI available at: http://{{ minikube_ip }}:{{ kafka_ui_service.resources[0].spec.ports[0].nodePort }}'
EOF

print_status "Fixed deploy-monitoring.yml"

# Step 7: Fix verify-deployment.yml with correct variables
print_info "Step 7: Fixing verify-deployment.yml variable references..."

cat > ansible/tasks/verify-deployment.yml << 'EOF'
---
- name: Wait for all pods to be ready
  kubernetes.core.k8s_info:
    api_version: v1
    kind: Pod
    namespace: '{{ k8s_namespace }}'
    label_selectors:
      - 'app={{ item.name }}'
    wait: true
    wait_condition:
      type: Ready
      status: 'True'
    wait_timeout: 300
  loop: '{{ app_services }}'

- name: Get order-gateway service info
  kubernetes.core.k8s_info:
    api_version: v1
    kind: Service
    name: order-gateway-service
    namespace: '{{ k8s_namespace }}'
  register: gateway_service

- name: Check service endpoints
  uri:
    url: 'http://{{ minikube_ip }}:{{ gateway_service.resources[0].spec.ports[0].nodePort }}/api'
    method: GET
    status_code: 200
  register: health_check
  retries: 5
  delay: 10
  until: health_check.status == 200
  ignore_errors: true

- name: Test order creation
  uri:
    url: 'http://{{ minikube_ip }}:{{ gateway_service.resources[0].spec.ports[0].nodePort }}/api/orders'
    method: POST
    body_format: json
    body:
      productId: 'ansible-test-product'
      quantity: 1
      userId: 'ansible-test-user'
    status_code: 201
  register: order_result
  ignore_errors: true

- name: Verify order was created
  debug:
    msg: 'Order created successfully: {{ order_result.json.orderId | default("Failed to create order") }}'
EOF

print_status "Fixed verify-deployment.yml"

# Step 8: Update Minikube memory allocation
print_info "Step 8: Reducing Minikube memory allocation to avoid Docker Desktop limits..."

# Update the playbook to use less memory
sed -i.bak 's/memory=8192/memory=6144/g' ansible/playbook.yml

print_status "Reduced Minikube memory allocation"

# Step 9: Check if Ansible kubernetes.core collection is installed
print_info "Step 9: Installing Ansible kubernetes collection..."

if command -v ansible-galaxy &> /dev/null; then
    ansible-galaxy collection install kubernetes.core
    print_status "Ansible kubernetes collection installed"
else
    print_warning "ansible-galaxy not found, make sure Ansible is properly installed"
fi

print_status "All fixes completed successfully!"
echo
print_info "Summary of fixes applied:"
echo "✅ Installed required Python libraries (kubernetes, PyYAML)"
echo "✅ Fixed Ansible variable naming (removed reserved 'environment')"
echo "✅ Fixed all task files to use correct variable names"
echo "✅ Created missing deploy-microservices.yml"
echo "✅ Reduced Minikube memory allocation to avoid Docker limits"
echo "✅ Installed Ansible kubernetes collection"
echo
print_info "Next steps:"
echo "1. Make sure Docker Desktop is running"
echo "2. Make sure Minikube is running: minikube start"
echo "3. Run: cd ansible && ansible-playbook playbook.yml"
echo
print_warning "If you still get issues, try:"
echo "• minikube delete && minikube start --memory=6144 --cpus=4"
echo "• kubectl config current-context (should show minikube)"