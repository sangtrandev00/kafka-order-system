import { Injectable, Inject } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateOrderDto,
  OrderCreatedEvent,
  KAFKA_TOPICS,
  GetOrdersRequest,
  GetOrderByIdRequest,
} from '@kafka-microservices/shared';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class OrderService {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka
  ) {}

  async onModuleInit() {
    // Subscribe to response topics BEFORE connecting
    this.kafkaClient.subscribeToResponseOf(KAFKA_TOPICS.GET_ORDERS_REQUEST);
    this.kafkaClient.subscribeToResponseOf(
      KAFKA_TOPICS.GET_ORDER_BY_ID_REQUEST
    );

    // Connect to Kafka
    await this.kafkaClient.connect();
  }

  async createOrder(createOrderDto: CreateOrderDto) {
    const orderId = uuidv4();

    // Simulate calculating total amount (in real app, this might come from product service)
    const totalAmount = createOrderDto.quantity * 100; // Assuming $100 per unit

    const orderCreatedEvent: OrderCreatedEvent = {
      orderId,
      productId: createOrderDto.productId,
      quantity: createOrderDto.quantity,
      userId: createOrderDto.userId,
      timestamp: new Date(),
      totalAmount,
    };

    // Emit the order created event
    this.kafkaClient.emit(KAFKA_TOPICS.ORDER_CREATED, orderCreatedEvent);

    return {
      success: true,
      orderId,
      message: 'Order created successfully',
      data: orderCreatedEvent,
    };
  }

  async getAllOrders(limit = 10, offset = 0) {
    const requestId = uuidv4();

    const getOrdersRequest: GetOrdersRequest = {
      requestId,
      limit,
      offset,
      timestamp: new Date(),
    };

    try {
      // Send request and wait for response
      const response = await firstValueFrom(
        this.kafkaClient
          .send(KAFKA_TOPICS.GET_ORDERS_REQUEST, getOrdersRequest)
          .pipe(timeout(5000)) // 5 second timeout
      );

      return {
        success: true,
        data: response.orders,
        totalCount: response.totalCount,
        message: 'Orders retrieved successfully',
      };
    } catch (error) {
      console.error('Error getting orders:', error);
      return {
        success: false,
        data: [],
        totalCount: 0,
        message: 'Failed to retrieve orders',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getOrderById(orderId: string) {
    const requestId = uuidv4();

    const getOrderRequest: GetOrderByIdRequest = {
      requestId,
      orderId,
      timestamp: new Date(),
    };

    try {
      // Send request and wait for response
      const response = await firstValueFrom(
        this.kafkaClient
          .send(KAFKA_TOPICS.GET_ORDER_BY_ID_REQUEST, getOrderRequest)
          .pipe(timeout(5000)) // 5 second timeout
      );

      if (response.success && response.order) {
        return {
          success: true,
          data: response.order,
          message: 'Order retrieved successfully',
        };
      } else {
        return {
          success: false,
          data: null,
          message: 'Order not found',
        };
      }
    } catch (error) {
      console.error('Error getting order by ID:', error);
      return {
        success: false,
        data: null,
        message: 'Failed to retrieve order',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
