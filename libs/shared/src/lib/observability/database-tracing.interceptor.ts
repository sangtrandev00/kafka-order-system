// libs/shared/src/lib/observability/database-tracing.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { Logger } from 'nestjs-pino';

@Injectable()
export class DatabaseTracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('database-tracing', '1.0.0');

  constructor(private logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    this.logger.log('DatabaseTracingInterceptor', 'Intercepting request');
    if (process.env.SIGNOZ_ENABLED !== 'true') {
      return next.handle();
    }

    const className = context.getClass().name;
    const methodName = context.getHandler().name;

    // Only trace methods that likely interact with database
    if (!this.isDatabaseMethod(className, methodName)) {
      return next.handle();
    }

    const spanName = `db.${this.getOperationType(methodName)}`;
    const startTime = Date.now();

    return this.tracer.startActiveSpan(
      spanName,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.system': this.getDatabaseSystem(className),
          'db.operation': this.getOperationType(methodName),
          'db.collection.name': this.getTableName(className),
          'method.class': className,
          'method.name': methodName,
        },
      },
      (span) => {
        return next.handle().pipe(
          tap((result) => {
            const duration = Date.now() - startTime;
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttributes({
              'db.duration_ms': duration,
              'db.rows_affected': this.getRowsAffected(result),
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
              'db.duration_ms': duration,
              'db.error': true,
            });
            throw error;
          }),
          tap(() => span.end())
        );
      }
    );
  }

  private isDatabaseMethod(className: string, methodName: string): boolean {
    const dbPatterns = [
      /Repository$/,
      /Service$/,
      /save/i,
      /find/i,
      /create/i,
      /update/i,
      /delete/i,
      /insert/i,
      /query/i,
    ];

    return dbPatterns.some(
      (pattern) => pattern.test(className) || pattern.test(methodName)
    );
  }

  private getOperationType(methodName: string): string {
    if (/create|insert|save/.test(methodName.toLowerCase())) return 'insert';
    if (/find|get|select|query/.test(methodName.toLowerCase())) return 'select';
    if (/update|modify/.test(methodName.toLowerCase())) return 'update';
    if (/delete|remove/.test(methodName.toLowerCase())) return 'delete';
    return 'unknown';
  }

  private getDatabaseSystem(className: string): string {
    if (className.includes('Mongo') || className.includes('Document'))
      return 'mongodb';
    if (className.includes('Repository') || className.includes('Entity'))
      return 'postgresql';
    return 'unknown';
  }

  private getTableName(className: string): string {
    // Extract table name from class name (e.g., OrderService -> orders, UserRepository -> users)
    const match = className.match(/^(\w+)(Service|Repository|Controller)$/);
    if (match) {
      return match[1].toLowerCase() + 's';
    }
    return 'unknown';
  }

  private getRowsAffected(result: any): number {
    if (typeof result === 'number') return result;
    if (Array.isArray(result)) return result.length;
    if (result?.affected) return result.affected;
    if (result?.insertedCount) return result.insertedCount;
    if (result?.modifiedCount) return result.modifiedCount;
    if (result?.deletedCount) return result.deletedCount;
    return 1;
  }
}
