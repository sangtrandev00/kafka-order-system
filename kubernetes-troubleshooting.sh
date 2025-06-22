#!/bin/bash
# kubernetes-troubleshooting.sh - Comprehensive troubleshooting for your deployment

echo "🔍 Kubernetes Troubleshooting Guide for Kafka Microservices"
echo "============================================================"

# Set namespace
NAMESPACE="kafka-microservices"

echo ""
echo "📊 1. CHECKING POD STATUS"
echo "========================="
echo "Current pod status:"
kubectl get pods -n $NAMESPACE -o wide

echo ""
echo "📋 2. GETTING DETAILED POD DESCRIPTIONS"
echo "======================================="
for pod in $(kubectl get pods -n $NAMESPACE --no-headers | awk '{print $1}'); do
    echo ""
    echo "--- Pod: $pod ---"
    kubectl describe pod $pod -n $NAMESPACE | grep -A 20 "Events:"
done

echo ""
echo "📜 3. CHECKING CONTAINER LOGS"
echo "============================="

# Function to get logs for each service
get_service_logs() {
    local service=$1
    echo ""
    echo "--- Logs for $service ---"
    
    # Get the pod name for this service
    pod=$(kubectl get pods -n $NAMESPACE -l app=$service --no-headers | awk '{print $1}' | head -1)
    
    if [ ! -z "$pod" ]; then
        echo "Pod: $pod"
        echo "Recent logs:"
        kubectl logs $pod -n $NAMESPACE --tail=50
        
        echo ""
        echo "Previous container logs (if crashed):"
        kubectl logs $pod -n $NAMESPACE --previous --tail=20 2>/dev/null || echo "No previous logs available"
    else
        echo "No pod found for service: $service"
    fi
    echo "----------------------------------------"
}

# Check logs for each service
get_service_logs "order-gateway"
get_service_logs "order-service" 
get_service_logs "notification-service"
get_service_logs "logger-service"

echo ""
echo "🔧 4. CHECKING INFRASTRUCTURE SERVICES"
echo "======================================"
get_service_logs "postgres"
get_service_logs "kafka"
get_service_logs "zookeeper"

echo ""
echo "🌐 5. CHECKING SERVICES AND NETWORKING"
echo "======================================"
echo "Services:"
kubectl get svc -n $NAMESPACE

echo ""
echo "ConfigMaps:"
kubectl get configmap -n $NAMESPACE

echo ""
echo "Secrets:"
kubectl get secrets -n $NAMESPACE

echo ""
echo "📊 6. RESOURCE USAGE"
echo "==================="
echo "Node resources:"
kubectl top nodes 2>/dev/null || echo "Metrics not available"

echo ""
echo "Pod resources:"
kubectl top pods -n $NAMESPACE 2>/dev/null || echo "Metrics not available"

echo ""
echo "🔍 7. TROUBLESHOOTING SUMMARY"
echo "============================="
echo "Common issues to check:"
echo "1. Database connection issues - Check if PostgreSQL is ready"
echo "2. Kafka connection issues - Check if Kafka and Zookeeper are ready"
echo "3. Environment variables - Check if ConfigMap and Secrets are correct"
echo "4. Image pull issues - Check if Docker images exist in Minikube"
echo "5. Port conflicts or networking issues"
echo "6. Resource constraints (CPU/Memory)"

echo ""
echo "💡 QUICK DIAGNOSTIC COMMANDS:"
echo "============================="
echo "Check specific pod logs:"
echo "kubectl logs <pod-name> -n $NAMESPACE"
echo ""
echo "Check previous crashed container logs:"
echo "kubectl logs <pod-name> -n $NAMESPACE --previous"
echo ""
echo "Get into a running pod for debugging:"
echo "kubectl exec -it <pod-name> -n $NAMESPACE -- /bin/sh"
echo ""
echo "Check if services can reach each other:"
echo "kubectl exec -it <pod-name> -n $NAMESPACE -- nslookup postgres-service"
echo "kubectl exec -it <pod-name> -n $NAMESPACE -- nslookup kafka-service"