#!/bin/bash
# fix-existing-tasks.sh - Add fallback kubectl commands to existing tasks

set -e

echo "🔧 Adding kubectl fallbacks to existing Ansible tasks..."

# Fix deploy-infrastructure.yml with fallback
cat > ansible/tasks/deploy-infrastructure.yml << 'EOF'
---
- name: Create namespace
  kubernetes.core.k8s:
    name: '{{ k8s_namespace }}'
    api_version: v1
    kind: Namespace
    state: present
  rescue:
    - name: Create namespace using kubectl (fallback)
      shell: kubectl create namespace {{ k8s_namespace }} --dry-run=client -o yaml | kubectl apply -f -
      changed_when: false

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
  rescue:
    - name: Deploy ConfigMap using kubectl (fallback)
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
  rescue:
    - name: Deploy Secrets using kubectl (fallback)
      shell: |
        kubectl create secret generic app-secrets \
          --namespace={{ k8s_namespace }} \
          --from-literal=DB_PASSWORD=postgres \
          --dry-run=client -o yaml | kubectl apply -f -
      changed_when: false

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
  rescue:
    - name: Deploy PostgreSQL PVC using kubectl (fallback)
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
  rescue:
    - name: Deploy PostgreSQL using kubectl (fallback)
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
  rescue:
    - name: Deploy PostgreSQL Service using kubectl (fallback)
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

- name: Deploy Zookeeper and Kafka
  include_tasks: deploy-kafka.yml
EOF

# Fix deploy-kafka.yml with fallback  
cat > ansible/tasks/deploy-kafka.yml << 'EOF'
---
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
  rescue:
    - name: Deploy Zookeeper using kubectl (fallback)
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
  rescue:
    - name: Deploy Zookeeper Service using kubectl (fallback)
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
        EOF
      changed_when: false

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
  rescue:
    - name: Deploy Kafka using kubectl (fallback)
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
  rescue:
    - name: Deploy Kafka Service using kubectl (fallback)
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
        EOF
      changed_when: false
EOF

echo "✅ Fixed existing tasks with kubectl fallbacks"
echo "Now your original playbook will work even if kubernetes module fails"
echo ""
echo "Try running: cd ansible && ansible-playbook playbook.yml"