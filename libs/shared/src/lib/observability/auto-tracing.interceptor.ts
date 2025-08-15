// libs/shared/src/lib/observability/auto-tracing.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Logger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

// Metadata key for excluding methods from auto-tracing
export const SKIP_TRACING = 'skip_tracing';
export const SkipTracing = Reflector.createDecorator<boolean>();

@Injectable()
export class AutoTracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('auto-tracing', '1.0.0');

  constructor(private reflector: Reflector, private logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    this.logger.log('AutoTracingInterceptor', 'Intercepting request');

    // Skip if OpenTelemetry is disabled
    if (process.env.SIGNOZ_ENABLED !== 'true') {
      return next.handle();
    }
    this.logger.log('AutoTracingInterceptor', 'OpenTelemetry is enabled');

    // Check if method should skip tracing
    const skipTracing = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRACING,
      [context.getHandler(), context.getClass()]
    );

    this.logger.log('AutoTracingInterceptor', 'Skip tracing: ' + skipTracing);

    if (skipTracing) {
      return next.handle();
    }

    // Get context information
    const className = context.getClass().name;
    const methodName = context.getHandler().name;
    const contextType = context.getType();

    // Skip health checks and internal methods
    if (this.shouldSkipMethod(className, methodName)) {
      return next.handle();
    }

    const spanName = `${className}.${methodName}`;
    const startTime = Date.now();

    return this.tracer.startActiveSpan(
      spanName,
      {
        kind: this.getSpanKind(contextType, className),
        attributes: {
          'method.class': className,
          'method.name': methodName,
          'context.type': contextType,
          'service.name': process.env.SERVICE_NAME || 'unknown',
        },
      },
      (span) => {
        return next.handle().pipe(
          tap((result) => {
            const duration = Date.now() - startTime;
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttributes({
              'operation.duration_ms': duration,
              'operation.success': true,
              'result.type': typeof result,
            });

            // Add business-specific attributes
            this.addBusinessAttributes(span, className, methodName, result);
          }),
          catchError((error) => {
            const duration = Date.now() - startTime;
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
            throw error;
          }),
          tap(() => span.end())
        );
      }
    );
  }

  private shouldSkipMethod(className: string, methodName: string): boolean {
    const skipPatterns = [
      /health/i,
      /ping/i,
      /metrics/i,
      /onModuleInit/i,
      /onModuleDestroy/i,
      /constructor/i,
    ];

    const fullMethodName = `${className}.${methodName}`;
    return skipPatterns.some((pattern) => pattern.test(fullMethodName));
  }

  private getSpanKind(contextType: string, className: string): SpanKind {
    if (contextType === 'http') {
      return SpanKind.SERVER;
    } else if (contextType === 'rpc' || className.includes('Controller')) {
      return SpanKind.CONSUMER;
    } else if (className.includes('Service')) {
      return SpanKind.INTERNAL;
    }
    return SpanKind.INTERNAL;
  }

  private addBusinessAttributes(
    span: any,
    className: string,
    methodName: string,
    result: any
  ) {
    // Add business-specific attributes based on method patterns
    if (methodName.includes('create') || methodName.includes('Create')) {
      span.setAttributes({
        'operation.type': 'create',
        'business.operation': 'creation',
      });

      // Extract ID from result if available
      if (result?.orderId) {
        span.setAttributes({ 'order.id': result.orderId });
      }
      if (result?.fileId) {
        span.setAttributes({ 'file.id': result.fileId });
      }
    }

    if (
      methodName.includes('get') ||
      methodName.includes('find') ||
      methodName.includes('Get')
    ) {
      span.setAttributes({
        'operation.type': 'read',
        'business.operation': 'retrieval',
      });

      // Extract count information
      if (Array.isArray(result)) {
        span.setAttributes({ 'result.count': result.length });
      }
      if (result?.totalCount) {
        span.setAttributes({ 'result.total_count': result.totalCount });
      }
    }

    if (methodName.includes('upload') || methodName.includes('Upload')) {
      span.setAttributes({
        'operation.type': 'upload',
        'business.operation': 'file_upload',
      });
    }

    if (methodName.includes('send') || methodName.includes('Send')) {
      span.setAttributes({
        'operation.type': 'send',
        'business.operation': 'notification',
      });
    }
  }
}
