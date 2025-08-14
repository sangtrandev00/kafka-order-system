import {
  GetOrderByIdRequest,
  GetOrderByIdResponse,
  GetOrdersRequest,
  GetOrdersResponse,
  OrderCreatedEvent,
  OrderStatus,
} from '@kafka-microservices/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from './order.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>
  ) {}

  async createOrder(orderData: OrderCreatedEvent): Promise<OrderEntity> {
    const order = this.orderRepository.create({
      id: orderData.orderId,
      productId: orderData.productId,
      quantity: orderData.quantity,
      userId: orderData.userId,
      totalAmount: orderData.totalAmount,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(order);
    console.log('✅ Order saved to database:', savedOrder);

    return savedOrder;
  }
  async findAll(
    limit = 10,
    offset = 0
  ): Promise<{
    orders: OrderEntity[];
    totalCount: number;
  }> {
    const [orders, totalCount] = await this.orderRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        createdAt: 'DESC',
      },
    });

    return { orders, totalCount };
  }

  async findOne(id: string): Promise<OrderEntity | null> {
    return this.orderRepository.findOne({ where: { id } });
  }

  async getOrdersWithResponse(
    request: GetOrdersRequest
  ): Promise<GetOrdersResponse> {
    try {
      const { orders, totalCount } = await this.findAll(
        request.limit,
        request.offset
      );

      console.log(
        `✅ Retrieved ${orders.length} orders (total: ${totalCount})`
      );

      return {
        requestId: request.requestId,
        orders: orders.map((order) => ({
          id: order.id,
          productId: order.productId,
          quantity: order.quantity,
          userId: order.userId,
          totalAmount: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })),
        totalCount,
        success: true,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('❌ Error retrieving orders:', error);

      return {
        requestId: request.requestId,
        orders: [],
        totalCount: 0,
        success: false,
        timestamp: new Date(),
      };
    }
  }

  async getOrderByIdWithResponse(
    request: GetOrderByIdRequest
  ): Promise<GetOrderByIdResponse> {
    try {
      const order = await this.findOne(request.orderId);

      if (order) {
        console.log(`✅ Retrieved order: ${order.id}`);

        return {
          requestId: request.requestId,
          order: {
            id: order.id,
            productId: order.productId,
            quantity: order.quantity,
            userId: order.userId,
            totalAmount: order.totalAmount,
            status: order.status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          },
          success: true,
          timestamp: new Date(),
        };
      } else {
        console.log(`❌ Order not found: ${request.orderId}`);

        return {
          requestId: request.requestId,
          order: null,
          success: false,
          timestamp: new Date(),
        };
      }
    } catch (error) {
      console.error('❌ Error retrieving order by ID:', error);

      return {
        requestId: request.requestId,
        order: null,
        success: false,
        timestamp: new Date(),
      };
    }
  }
}
