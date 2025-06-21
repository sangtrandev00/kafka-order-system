import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { NotificationService } from './notification.service';
import { OrderCreatedEvent, KAFKA_TOPICS } from '@kafka-microservices/shared';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    console.log('📧 Notification Service received order_created event:', data);
    return this.notificationService.sendOrderConfirmation(data);
  }
}
