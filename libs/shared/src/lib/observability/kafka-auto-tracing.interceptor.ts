// libs/shared/src/lib/observability/kafka-auto-tracing.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class KafkaAutoTracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('kafka-auto-tracing', '1.0.0');

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler
  ): Observable<any> {
    if (process.env.SIGNOZ_ENABLED !== 'true') {
      return next.handle();
    }

    const contextType = executionContext.getType();

    // Only handle Kafka/RPC contexts
    if (contextType !== 'rpc') {
      return next.handle();
    }

    const rpcContext = executionContext.switchToRpc();
    const data = rpcContext.getData();
    const pattern = rpcContext.getContext();

    const className = executionContext.getClass().name;
    const methodName = executionContext.getHandler().name;
    const startTime = Date.now();

    // Extract trace context from Kafka message if available
    let parentContext = context.active();
    if (data?.traceHeaders) {
      parentContext = propagation.extract(context.active(), data.traceHeaders);
    }

    const spanName = `kafka.${pattern || methodName}`;

    return this.tracer.startActiveSpan(
      spanName,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'kafka',
          'messaging.destination': pattern || 'unknown',
          'messaging.operation': 'receive',
          'service.name': process.env.SERVICE_NAME || 'unknown',
          'method.class': className,
          'method.name': methodName,
        },
      },
      parentContext,
      (span) => {
        // Add message-specific attributes
        if (data?.orderId) {
          span.setAttributes({ 'order.id': data.orderId });
        }
        if (data?.userId) {
          span.setAttributes({ 'user.id': data.userId });
        }
        if (data?.sagaId) {
          span.setAttributes({ 'saga.id': data.sagaId });
        }

        return next.handle().pipe(
          tap((result) => {
            const duration = Date.now() - startTime;
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttributes({
              'messaging.processing_duration_ms': duration,
              'messaging.success': true,
            });
          }),
          catchError((error) => {
            const duration = Date.now() - startTime;
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.setAttributes({
              'messaging.processing_duration_ms': duration,
              'messaging.success': false,
            });
            throw error;
          }),
          tap(() => span.end())
        );
      }
    );
  }
}
