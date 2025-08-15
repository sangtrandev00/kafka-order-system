import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrderService } from './order.service';
import type { OrderCreatedEvent } from '@kafka-microservices/shared';
import { KAFKA_TOPICS } from '@kafka-microservices/shared';
import { Logger } from 'nestjs-pino';

@Controller()
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly logger: Logger
  ) {}

  @EventPattern(KAFKA_TOPICS.ORDER_CREATED)
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    this.logger.log('📦 Order Service received order_created event:', data);
    return this.orderService.createOrder(data);
  }

  @MessagePattern(KAFKA_TOPICS.GET_ORDER_BY_ID_REQUEST)
  async handleGetOrder(@Payload() data: { orderId: string }) {
    this.logger.log('📦 Order Service received get_order event:', data);
    return this.orderService.findOne(data.orderId);
  }

  @MessagePattern(KAFKA_TOPICS.GET_ORDERS_REQUEST)
  async handleGetAllOrders() {
    this.logger.log('📦 Order Service received get_all_orders event:');
    return this.orderService.findAll();
  }
}
