// libs/shared/src/lib/observability/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

@Injectable()
export class MetricsService {
  private readonly meter = metrics.getMeter('kafka-microservices', '1.0.0');

  // Order metrics
  readonly orderCreatedCounter = this.meter.createCounter(
    'orders_created_total',
    {
      description: 'Total number of orders created',
    }
  );

  readonly orderValueHistogram = this.meter.createHistogram('order_value_usd', {
    description: 'Distribution of order values in USD',
    unit: 'USD',
  });

  readonly orderProcessingDuration = this.meter.createHistogram(
    'order_processing_duration_ms',
    {
      description: 'Time taken to process orders',
      unit: 'ms',
    }
  );

  // File upload metrics
  readonly fileUploadCounter = this.meter.createCounter(
    'files_uploaded_total',
    {
      description: 'Total number of files uploaded',
    }
  );

  readonly fileUploadSize = this.meter.createHistogram(
    'file_upload_size_bytes',
    {
      description: 'Distribution of uploaded file sizes',
      unit: 'bytes',
    }
  );

  readonly fileUploadDuration = this.meter.createHistogram(
    'file_upload_duration_ms',
    {
      description: 'Time taken to upload files',
      unit: 'ms',
    }
  );

  // Kafka metrics
  readonly kafkaMessagesSent = this.meter.createCounter(
    'kafka_messages_sent_total',
    {
      description: 'Total number of Kafka messages sent',
    }
  );

  readonly kafkaMessagesReceived = this.meter.createCounter(
    'kafka_messages_received_total',
    {
      description: 'Total number of Kafka messages received',
    }
  );

  readonly kafkaMessageProcessingDuration = this.meter.createHistogram(
    'kafka_message_processing_duration_ms',
    {
      description: 'Time taken to process Kafka messages',
      unit: 'ms',
    }
  );

  // Notification metrics
  readonly notificationsSent = this.meter.createCounter(
    'notifications_sent_total',
    {
      description: 'Total number of notifications sent',
    }
  );

  // Database metrics
  readonly databaseQueryDuration = this.meter.createHistogram(
    'database_query_duration_ms',
    {
      description: 'Time taken to execute database queries',
      unit: 'ms',
    }
  );

  // S3 metrics
  readonly s3OperationsCounter = this.meter.createCounter(
    's3_operations_total',
    {
      description: 'Total number of S3 operations',
    }
  );

  readonly s3OperationDuration = this.meter.createHistogram(
    's3_operation_duration_ms',
    {
      description: 'Time taken for S3 operations',
      unit: 'ms',
    }
  );

  // Saga metrics
  readonly sagaStartedCounter = this.meter.createCounter(
    'sagas_started_total',
    {
      description: 'Total number of sagas started',
    }
  );

  readonly sagaCompletedCounter = this.meter.createCounter(
    'sagas_completed_total',
    {
      description: 'Total number of sagas completed',
    }
  );

  readonly sagaFailedCounter = this.meter.createCounter('sagas_failed_total', {
    description: 'Total number of sagas failed',
  });

  // Active connections gauge
  readonly activeConnections = this.meter.createUpDownCounter(
    'active_connections',
    {
      description: 'Number of active connections',
    }
  );
}
