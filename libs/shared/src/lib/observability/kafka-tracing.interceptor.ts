// libs/shared/src/lib/observability/kafka-tracing.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class KafkaTracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('kafka-microservices', '1.0.0');

  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (process.env.SIGNOZ_ENABLED !== 'true') {
      return next.handle();
    }

    const kafkaContext = context.switchToRpc();
    const pattern = kafkaContext.getContext();

    const startTime = Date.now();

    return this.tracer.startActiveSpan(
      `kafka.${pattern}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'kafka',
          'messaging.destination': pattern,
          'messaging.operation': 'receive',
          'service.name': process.env.SERVICE_NAME || 'unknown',
        },
      },
      (span: Span) => {
        this.metricsService.kafkaMessagesReceived.add(1, {
          topic: pattern,
          service: process.env.SERVICE_NAME || 'unknown',
        });

        return next.handle().pipe(
          tap(() => {
            const duration = Date.now() - startTime;
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttributes({
              'messaging.processing_duration_ms': duration,
              'messaging.success': true,
            });

            this.metricsService.kafkaMessageProcessingDuration.record(
              duration,
              {
                topic: pattern,
                service: process.env.SERVICE_NAME || 'unknown',
                status: 'success',
              }
            );
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

            this.metricsService.kafkaMessageProcessingDuration.record(
              duration,
              {
                topic: pattern,
                service: process.env.SERVICE_NAME || 'unknown',
                status: 'error',
              }
            );

            throw error;
          })
        );
      }
    );
  }
}
