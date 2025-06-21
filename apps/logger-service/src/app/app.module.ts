import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerController } from './logger/logger.controller';
import { LoggerService } from './logger/logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [LoggerController],
  providers: [LoggerService],
})
export class AppModule {}
