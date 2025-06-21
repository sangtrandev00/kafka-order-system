import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'logger-service',
          brokers: ['localhost:9092'],
        },
        consumer: {
          groupId: 'logger-service-consumer',
        },
      },
    }
  );

  await app.listen();
  console.log('🚀 Logger Service is running and listening to Kafka events');
}

bootstrap();
