import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { LoggerService } from './logger.service';
import { OrderCreatedEvent, KAFKA_TOPICS } from '@kafka-microservices/shared';

@Controller()
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    console.log('📝 Logger Service received order_created event:', data);
    return this.loggerService.logEvent('ORDER_CREATED', data);
  }

  // You can add more event patterns here for different events
  @EventPattern(KAFKA_TOPICS.ORDER_UPDATED)
  async handleOrderUpdated(@Payload() data: any) {
    console.log('📝 Logger Service received order_updated event:', data);
    return this.loggerService.logEvent('ORDER_UPDATED', data);
  }
}
