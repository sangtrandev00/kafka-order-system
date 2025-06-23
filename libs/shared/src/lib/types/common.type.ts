export interface CreateOrderDto {
  productId: string;
  quantity: number;
  userId: string;
}

export interface OrderCreatedEvent {
  orderId: string;
  productId: string;
  quantity: number;
  userId: string;
  timestamp: Date;
  totalAmount?: number;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  userId: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export interface LogEvent {
  eventType: string;
  timestamp: Date;
  payload: any;
  service: string;
}

export interface GetOrdersRequest {
  requestId: string;
  userId?: string;
  status?: OrderStatus;
  limit?: number;
  offset?: number;
  timestamp: Date;
}

export interface GetOrdersResponse {
  requestId: string;
  orders: Order[];
  totalCount: number;
  success: boolean;
  timestamp: Date;
}

export interface GetOrderByIdRequest {
  requestId: string;
  orderId: string;
  timestamp: Date;
}

export interface GetOrderByIdResponse {
  requestId: string;
  order: Order | null;
  success: boolean;
  timestamp: Date;
}

export const KAFKA_TOPICS = {
  // Existing topics
  ORDER_CREATED: 'order_created',
  ORDER_UPDATED: 'order_updated',
  NOTIFICATION_REQUEST: 'notification_request',
  LOG_EVENT: 'log_event',
  GET_ORDERS_REQUEST: 'get_orders_request',
  GET_ORDERS_RESPONSE: 'get_orders_response',
  GET_ORDER_BY_ID_REQUEST: 'get_order_by_id_request',
  GET_ORDER_BY_ID_RESPONSE: 'get_order_by_id_response',

  // File upload saga topics
  FILE_UPLOAD_SAGA_STARTED: 'file_upload_saga.started',
  FILE_S3_UPLOADED: 'file_upload_saga.s3_uploaded',
  FILE_METADATA_SAVED: 'file_upload_saga.metadata_saved',
  FILE_UPLOAD_COMPLETED: 'file_upload_saga.completed',
  FILE_UPLOAD_FAILED: 'file_upload_saga.failed',
  FILE_S3_DELETED: 'file_upload_saga.s3_deleted',
  FILE_UPLOAD_COMPENSATED: 'file_upload_saga.compensated',
} as const;
