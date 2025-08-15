import { SpanStatusCode, trace } from '@opentelemetry/api';
export function Traced(spanName?: string, recordMetrics = false) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const tracer = trace.getTracer('kafka-microservices', '1.0.0');

    descriptor.value = async function (...args: any[]) {
      // Skip tracing if not enabled
      if (process.env.SIGNOZ_ENABLED !== 'true') {
        return await originalMethod.apply(this, args);
      }

      const finalSpanName =
        spanName || `${target.constructor.name}.${propertyKey}`;
      const startTime = Date.now();

      return await tracer.startActiveSpan(finalSpanName, async (span) => {
        try {
          span.setAttributes({
            'method.class': target.constructor.name,
            'method.name': propertyKey,
            'service.name': process.env.SERVICE_NAME || 'unknown',
            'operation.start_time': startTime,
          });

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

          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          span.setAttributes({
            'operation.duration_ms': duration,
            'operation.success': false,
            'error.type':
              error instanceof Error ? error.constructor.name : 'Unknown',
          });

          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
