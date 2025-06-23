/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // Create HTTP app for file uploads
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Enable CORS for file uploads
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:4200'],
    credentials: true,
  });

  // Create Kafka microservice for saga events
  const kafkaMicroservice = app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'upload-service',
        brokers: [process.env.KAFKA_BROKERS || 'kafka-service:9092'],
      },
      consumer: {
        groupId: 'upload-service-consumer',
      },
    },
  });

  // Start both HTTP and Kafka services
  await app.startAllMicroservices();

  const port = process.env.UPLOAD_SERVICE_PORT || 3005;
  await app.listen(port);

  console.log(
    `🚀 Upload Service is running on: http://localhost:${port}/${globalPrefix}`
  );
  console.log('📨 Upload Service is listening to Kafka events');
}

bootstrap();
