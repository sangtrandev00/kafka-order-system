import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationController } from './notification/notification.controller';
import { NotificationService } from './notification/notification.service';
import { GlobalTracingModule } from '@kafka-microservices/shared';

@Module({
  imports: [
    GlobalTracingModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class AppModule {}
