import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

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

export class TelemetryConfigService {
  private sdk: NodeSDK | null = null;

  async initializeTelemetry(config: TelemetryConfig): Promise<void> {
    if (!this.shouldEnableTelemetry()) {
      console.log('📊 Telemetry disabled');
      return;
    }

    const resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]:
          config.serviceVersion || '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
          config.environment || 'development',
      })
    );

    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-pino': {
        enabled: true,
        logHook: (span, record) => {
          record['trace_id'] = span.spanContext().traceId;
          record['span_id'] = span.spanContext().spanId;
          record['trace_flags'] = span.spanContext().traceFlags;
        },
      },
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
      // '@opentelemetry/instrumentation-postgres': { enabled: true },
    });

    let traceExporter;
    let metricReader;

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

    if (config.enableMetrics && config.signozEndpoint) {
      const metricExporter = new OTLPMetricExporter({
        url: `${config.signozEndpoint}/v1/metrics`,
        headers: config.signozAccessToken
          ? {
              'signoz-access-token': config.signozAccessToken,
            }
          : {},
      });

      metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 5000,
      });
    }

    this.sdk = new NodeSDK({
      resource,
      instrumentations,
      ...(traceExporter && { traceExporter }),
      ...(metricReader && { metricReader: metricReader as any }),
    });

    await this.sdk.start();
    console.log(`📊 Telemetry initialized for service: ${config.serviceName}`);
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      console.log('📊 Telemetry shutdown complete');
    }
  }

  private shouldEnableTelemetry(): boolean {
    return process.env.SIGNOZ_ENABLED === 'true';
  }
}
