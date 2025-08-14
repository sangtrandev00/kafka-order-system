/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import './telemetry';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger as PinoLogger } from 'nestjs-pino';
import { Logger } from '@nestjs/common';
// Set service name BEFORE creating app
process.env.SERVICE_NAME = 'order-gateway';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}

bootstrap().catch((error) => {
  console.error('Failed to start Order Gateway:', error);
  process.exit(1);
});
