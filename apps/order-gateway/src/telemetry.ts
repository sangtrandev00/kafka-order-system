import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

// This runs IMMEDIATELY when imported (before any NestJS code)
if (process.env.SIGNOZ_ENABLED === 'true') {
  console.log('🔄 Initializing OpenTelemetry...');

  const serviceName = process.env.SERVICE_NAME || 'order-gateway';

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
      'service.namespace': 'kafka-microservices',
    }),

    traceExporter: new OTLPTraceExporter({
      url: `${
        process.env.SIGNOZ_ENDPOINT || 'http://localhost:4318'
      }/v1/traces`,
      headers: process.env.SIGNOZ_ACCESS_TOKEN
        ? {
            'signoz-access-token': process.env.SIGNOZ_ACCESS_TOKEN,
          }
        : {},
    }),

    instrumentations: [
      getNodeAutoInstrumentations({
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
        '@opentelemetry/instrumentation-nestjs-core': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
      }),
    ],
  });

  // Start SDK immediately
  sdk.start();
  console.log(`✅ OpenTelemetry started for ${serviceName}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown();
      console.log('📊 OpenTelemetry shutdown complete');
    } catch (error) {
      console.error('❌ OpenTelemetry shutdown error:', error);
    }
  });
}
