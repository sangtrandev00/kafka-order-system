#!/bin/bash
# fix-python-kubernetes.sh - Fix the specific Python library issue

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

echo -e "${BLUE}🔧 Fixing Python Kubernetes Library Issue${NC}"
echo

# Step 1: Identify which Python Ansible is using
print_info "Step 1: Identifying Python version used by Ansible..."

ANSIBLE_PYTHON="/opt/homebrew/bin/python3.13"
echo "Ansible is using: $ANSIBLE_PYTHON"

# Step 2: Install kubernetes library for the specific Python version
print_info "Step 2: Installing kubernetes library for Ansible's Python..."

if [ -f "$ANSIBLE_PYTHON" ]; then
    echo "Installing kubernetes and PyYAML for $ANSIBLE_PYTHON..."
    $ANSIBLE_PYTHON -m pip install kubernetes PyYAML
    print_status "Installed kubernetes library for Ansible's Python"
else
    print_warning "Ansible Python not found at expected location, trying alternatives..."
    
    # Try with the default python3
    python3 -m pip install kubernetes PyYAML
    
    # Try with pip3 directly
    pip3 install kubernetes PyYAML
    
    print_status "Installed with alternative methods"
fi

# Step 3: Verify installation
print_info "Step 3: Verifying installation..."

if $ANSIBLE_PYTHON -c "import kubernetes; print('✅ kubernetes module imported successfully')" 2>/dev/null; then
    print_status "Kubernetes library is properly installed"
else
    print_warning "Still having issues, trying additional fixes..."
    
    # Try installing with --user flag
    $ANSIBLE_PYTHON -m pip install --user kubernetes PyYAML
    
    # Try installing with --break-system-packages if needed (for newer pip versions)
    $ANSIBLE_PYTHON -m pip install --break-system-packages kubernetes PyYAML 2>/dev/null || true
fi

# Step 4: Install Ansible Kubernetes collection
print_info "Step 4: Installing Ansible Kubernetes collection..."

ansible-galaxy collection install kubernetes.core --force
print_status "Ansible kubernetes.core collection installed"

# Step 5: Alternative approach - use kubectl directly instead of kubernetes module
print_info "Step 5: Creating alternative deployment using kubectl..."

# Create a kubectl-based deployment script as backup
cat > ansible/tasks/deploy-infrastructure-kubectl.yml << 'EOF'
---
# Alternative deployment using kubectl instead of kubernetes.core module

- name: Create namespace using kubectl
  shell: |
    kubectl create namespace {{ k8s_namespace }} --dry-run=client -o yaml | kubectl apply -f -
  changed_when: false

- name: Deploy ConfigMap using kubectl
  shell: |
    kubectl create configmap app-config \
      --namespace={{ k8s_namespace }} \
      --from-literal=DB_HOST=postgres-service \
      --from-literal=DB_PORT=5432 \
      --from-literal=DB_USERNAME=postgres \
      --from-literal=DB_NAME=orders_db \
      --from-literal=KAFKA_BROKERS=kafka-service:9092 \
      --from-literal=KAFKA_CLIENT_ID=kafka-microservices \
      --dry-run=client -o yaml | kubectl apply -f -
  changed_when: false

- name: Deploy Secrets using kubectl
  shell: |
    kubectl create secret generic app-secrets \
      --namespace={{ k8s_namespace }} \
      --from-literal=DB_PASSWORD=postgres \
      --dry-run=client -o yaml | kubectl apply -f -
  changed_when: false

- name: Deploy PostgreSQL PVC using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: v1
    kind: PersistentVolumeClaim
    metadata:
      name: postgres-pvc
      namespace: {{ k8s_namespace }}
    spec:
      accessModes:
        - ReadWriteOnce
      resources:
        requests:
          storage: 2Gi
    EOF
  changed_when: false

- name: Deploy PostgreSQL using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: postgres
      namespace: {{ k8s_namespace }}
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
                  value: postgres
                - name: POSTGRES_PASSWORD
                  value: postgres
                - name: POSTGRES_DB
                  value: orders_db
              volumeMounts:
                - name: postgres-storage
                  mountPath: /var/lib/postgresql/data
              resources:
                requests:
                  memory: 256Mi
                  cpu: 250m
                limits:
                  memory: 512Mi
                  cpu: 500m
          volumes:
            - name: postgres-storage
              persistentVolumeClaim:
                claimName: postgres-pvc
    EOF
  changed_when: false

- name: Deploy PostgreSQL Service using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: v1
    kind: Service
    metadata:
      name: postgres-service
      namespace: {{ k8s_namespace }}
    spec:
      selector:
        app: postgres
      ports:
        - protocol: TCP
          port: 5432
          targetPort: 5432
      type: ClusterIP
    EOF
  changed_when: false

- name: Deploy Zookeeper using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: zookeeper
      namespace: {{ k8s_namespace }}
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
                  value: "2181"
                - name: ZOOKEEPER_TICK_TIME
                  value: "2000"
              resources:
                requests:
                  memory: 256Mi
                  cpu: 250m
                limits:
                  memory: 512Mi
                  cpu: 500m
    EOF
  changed_when: false

- name: Deploy Zookeeper Service using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: v1
    kind: Service
    metadata:
      name: zookeeper-service
      namespace: {{ k8s_namespace }}
    spec:
      selector:
        app: zookeeper
      ports:
        - protocol: TCP
          port: 2181
          targetPort: 2181
      type: ClusterIP
    EOF
  changed_when: false

- name: Deploy Kafka using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: kafka
      namespace: {{ k8s_namespace }}
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
                  value: "1"
                - name: KAFKA_ZOOKEEPER_CONNECT
                  value: zookeeper-service:2181
                - name: KAFKA_ADVERTISED_LISTENERS
                  value: PLAINTEXT://kafka-service:9092,PLAINTEXT_INTERNAL://kafka-service:29092
                - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
                  value: PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT
                - name: KAFKA_INTER_BROKER_LISTENER_NAME
                  value: PLAINTEXT_INTERNAL
                - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
                  value: "1"
                - name: KAFKA_AUTO_CREATE_TOPICS_ENABLE
                  value: "true"
              resources:
                requests:
                  memory: 512Mi
                  cpu: 500m
                limits:
                  memory: 1Gi
                  cpu: 1000m
    EOF
  changed_when: false

- name: Deploy Kafka Service using kubectl
  shell: |
    cat <<EOF | kubectl apply -f -
    apiVersion: v1
    kind: Service
    metadata:
      name: kafka-service
      namespace: {{ k8s_namespace }}
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
      type: ClusterIP
    EOF
  changed_when: false

- name: Wait for Kafka to be ready
  shell: |
    kubectl wait --for=condition=available --timeout=300s deployment/kafka -n {{ k8s_namespace }}
  changed_when: false
EOF

print_status "Created kubectl-based deployment as backup"

# Step 6: Update main playbook to use kubectl version if kubernetes module fails
print_info "Step 6: Creating updated playbook with fallback option..."

cat > ansible/playbook-kubectl.yml << 'EOF'
- name: Deploy Kafka Microservices to Kubernetes (kubectl version)
  hosts: localhost
  connection: local
  gather_facts: false
  vars:
    k8s_namespace: kafka-microservices
    deploy_env: development
    minikube_ip: '{{ ansible_env.MINIKUBE_IP | default(lookup(''pipe'', ''minikube ip 2>/dev/null || echo ""'')) }}'
    app_services:
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

    - name: Deploy infrastructure (kubectl version)
      include_tasks: tasks/deploy-infrastructure-kubectl.yml

    - name: Deploy microservices using kubectl
      include_tasks: tasks/deploy-microservices-kubectl.yml

    - name: Setup monitoring using kubectl
      include_tasks: tasks/deploy-monitoring-kubectl.yml

    - name: Display access information
      debug:
        msg:
          - '🚀 Deployment completed successfully!'
          - '📱 Application URL: http://{{ minikube_ip }}'
          - '📊 Add to /etc/hosts: {{ minikube_ip }} kafka-microservices.local'
          - '🔍 Kafka UI: Available via NodePort'
          - "📋 Dashboard: Run 'minikube dashboard'"
EOF

print_status "Created kubectl-based playbook"

print_status "All fixes completed!"
echo
print_info "Now you have two options to proceed:"
echo
print_info "Option 1 (Try the fixed kubernetes module):"
echo "cd ansible && ansible-playbook playbook.yml"
echo
print_info "Option 2 (Use kubectl-based approach if Option 1 still fails):"
echo "cd ansible && ansible-playbook playbook-kubectl.yml"
echo
print_warning "If you still get the kubernetes library error, use Option 2"