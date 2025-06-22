import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OrderController } from './order/order.controller';
import { OrderService } from './order/order.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'order-gateway',
            brokers: [process.env.KAFKA_BROKERS || 'kafka-service:9092'],
            retry: {
              initialRetryTime: 100,
              retries: 8,
            },
            connectionTimeout: 3000,
            requestTimeout: 25000,
          },
          consumer: {
            groupId: 'order-gateway-consumer',
            retry: {
              initialRetryTime: 100,
              retries: 8,
            },
          },
          subscribe: {
            fromBeginning: true,
          },
          // Enable request-response pattern
          producerOnlyMode: false,
        },
      },
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class AppModule {}
