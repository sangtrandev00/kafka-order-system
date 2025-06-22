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
          clientId: 'order-service',
          brokers: [process.env.KAFKA_BROKERS || 'kafka-service:9092'],
        },
        consumer: {
          groupId: 'order-service-consumer',
        },
      },
    }
  );

  await app.listen();
  console.log('🚀 Order Service is running and listening to Kafka events');
}

bootstrap();
