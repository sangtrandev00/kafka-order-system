// libs/shared/src/lib/observability/tracing.decorator.ts
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

export interface TracingOptions {
  spanName?: string;
  spanKind?: SpanKind;
  recordMetrics?: boolean;
  attributes?: Record<string, string | number | boolean>;
}

export function Traced(options: TracingOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const tracer = trace.getTracer('kafka-microservices', '1.0.0');

    descriptor.value = async function (...args: any[]) {
      if (process.env.SIGNOZ_ENABLED !== 'true') {
        return await originalMethod.apply(this, args);
      }

      const spanName =
        options.spanName || `${target.constructor.name}.${propertyKey}`;
      const startTime = Date.now();

      return await tracer.startActiveSpan(
        spanName,
        {
          kind: options.spanKind || SpanKind.INTERNAL,
          attributes: {
            'method.class': target.constructor.name,
            'method.name': propertyKey,
            'service.name': process.env.SERVICE_NAME || 'unknown',
            ...options.attributes,
          },
        },
        async (span) => {
          try {
            const result = await originalMethod.apply(this, args);
            const duration = Date.now() - startTime;

            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttributes({
              'operation.duration_ms': duration,
              'operation.success': true,
            });

            return result;
          } catch (error) {
            const duration = Date.now() - startTime;

            if (error instanceof Error) {
              span.recordException(error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              span.setAttributes({
                'operation.duration_ms': duration,
                'operation.success': false,
                'error.type': error.constructor.name,
              });
            } else {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: String(error),
              });
              span.setAttributes({
                'operation.duration_ms': duration,
                'operation.success': false,
                'error.type': 'Unknown',
              });
            }

            throw error;
          } finally {
            span.end();
          }
        }
      );
    };

    return descriptor;
  };
}
