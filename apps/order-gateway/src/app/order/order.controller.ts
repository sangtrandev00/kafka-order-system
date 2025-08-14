import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { OrderService } from './order.service';
import { Traced, type CreateOrderDto } from '@kafka-microservices/shared';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @Traced('create_oder')
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(createOrderDto);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.orderService.getOrderById(id);
  }

  @Get()
  @Traced('get_all_orders')
  async getAllOrders(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    return this.orderService.getAllOrders(parsedLimit, parsedOffset);
  }
}
