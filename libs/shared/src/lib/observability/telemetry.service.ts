// libs/shared/src/lib/observability/telemetry.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  signozEndpoint?: string;
  signozAccessToken?: string;
  enableTraces?: boolean;
  enableMetrics?: boolean;
  enableLogs?: boolean;
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private sdk: NodeSDK | null = null;

  async onModuleInit(): Promise<void> {
    await this.initializeTelemetry();
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  private async initializeTelemetry(): Promise<void> {
    const config = this.getConfig();

    if (!this.shouldEnableTelemetry()) {
      this.logger.log('📊 OpenTelemetry disabled');
      return;
    }

    try {
      // Create resource for service identification
      const resource = new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.serviceVersion || '1.0.0',
        'deployment.environment': config.environment || 'development',
        'service.namespace': 'kafka-microservices',
      });

      // Configure instrumentations
      const instrumentations = getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req) => {
            return (
              req.url?.includes('/health') ||
              req.url?.includes('/metrics') ||
              req.url?.includes('/favicon.ico') ||
              false
            );
          },
        },
        // '@opentelemetry/instrumentation-kafkajs': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-mongodb': { enabled: true },
        '@opentelemetry/instrumentation-pino': {
          enabled: true,
          logHook: (span, record) => {
            record['trace_id'] = span.spanContext().traceId;
            record['span_id'] = span.spanContext().spanId;
            record['trace_flags'] = span.spanContext().traceFlags;
          },
        },
      });

      // Configure exporters
      let traceExporter;

      if (config.enableTraces && config.signozEndpoint) {
        traceExporter = new OTLPTraceExporter({
          url: `${config.signozEndpoint}/v1/traces`,
          headers: config.signozAccessToken
            ? {
                'signoz-access-token': config.signozAccessToken,
              }
            : {},
        });
      }

      // Metrics are handled by custom metrics service instead
      // if (config.enableMetrics && config.signozEndpoint) {
      //   const metricExporter = new OTLPMetricExporter({
      //     url: `${config.signozEndpoint}/v1/metrics`,
      //     headers: config.signozAccessToken
      //       ? {
      //           'signoz-access-token': config.signozAccessToken,
      //         }
      //       : {},
      //   });

      //   metricReader = new PeriodicExportingMetricReader({
      //     exporter: metricExporter,
      //     exportIntervalMillis: 60000, // Export every minute
      //   });
      // }

      // Log processing is handled by pino transport instead
      // if (config.enableLogs && config.signozEndpoint) {
      //   const logExporter = new OTLPLogExporter({
      //     url: `${config.signozEndpoint}/v1/logs`,
      //     headers: config.signozAccessToken
      //       ? {
      //           'signoz-access-token': config.signozAccessToken,
      //         }
      //       : {},
      //   });

      //   logRecordProcessor = new BatchLogRecordProcessor(logExporter);
      // }

      // Initialize SDK
      this.sdk = new NodeSDK({
        resource,
        instrumentations,
        ...(traceExporter && { traceExporter }),
      });

      await this.sdk.start();
      this.logger.log(
        `📊 OpenTelemetry initialized for service: ${config.serviceName}`
      );

      // Setup graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    } catch (error) {
      this.logger.error(
        `❌ Failed to initialize OpenTelemetry: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private getConfig(): TelemetryConfig {
    return {
      serviceName: process.env.SERVICE_NAME || 'unknown-service',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      signozEndpoint: process.env.SIGNOZ_ENDPOINT || 'http://localhost:4318',
      signozAccessToken: process.env.SIGNOZ_ACCESS_TOKEN,
      enableTraces: process.env.SIGNOZ_ENABLED === 'true',
      enableMetrics: process.env.SIGNOZ_ENABLED === 'true',
      enableLogs: process.env.SIGNOZ_ENABLED === 'true',
    };
  }

  private shouldEnableTelemetry(): boolean {
    return process.env.SIGNOZ_ENABLED === 'true';
  }

  private async shutdown(): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        this.logger.log('📊 OpenTelemetry shutdown complete');
      } catch (error) {
        this.logger.error(
          `❌ OpenTelemetry shutdown error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }
}
