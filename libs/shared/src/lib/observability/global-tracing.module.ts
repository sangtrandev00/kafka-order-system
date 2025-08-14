// libs/shared/src/lib/observability/global-tracing.module.ts
import { Module, Global } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AutoTracingInterceptor } from './auto-tracing.interceptor';
import { DatabaseTracingInterceptor } from './database-tracing.interceptor';
import { KafkaAutoTracingInterceptor } from './kafka-auto-tracing.interceptor';
import { LoggerModule } from 'nestjs-pino';
import { createPinoAsyncConfig } from '../pino/pino.config';

@Global()
@Module({
  imports: [LoggerModule.forRootAsync(createPinoAsyncConfig())],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AutoTracingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DatabaseTracingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: KafkaAutoTracingInterceptor,
    },
  ],
})
export class GlobalTracingModule {}
