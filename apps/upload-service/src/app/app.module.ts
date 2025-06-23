// apps/upload-service/src/app/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';

// Import our modules
import { UploadController } from './upload/upload.controller';
import { UploadService } from './upload/upload.service';
import { S3Service } from './s3/s3.service';
import { SagaService } from './saga/saga.service';
import { SagaEventHandler } from './saga/saga-event.handler';

// Import schemas
import {
  FileMetadata,
  FileMetadataSchema,
} from './schemas/file-metadata.schema';
import { SagaState, SagaStateSchema } from './schemas/saga-state.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // MongoDB connection
    MongooseModule.forRoot(
      process.env.MONGODB_URI ||
        'mongodb://admin:admin123@localhost:27017/kafka_microservices?authSource=admin'
    ),

    // Register schemas
    MongooseModule.forFeature([
      { name: FileMetadata.name, schema: FileMetadataSchema },
      { name: SagaState.name, schema: SagaStateSchema },
    ]),

    // Kafka client for publishing events
    ClientsModule.register([
      {
        name: 'KAFKA_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'upload-service-client',
            brokers: [process.env.KAFKA_BROKERS || 'kafka-service:9092'],
          },
          consumer: {
            groupId: 'upload-service-client-consumer',
          },
        },
      },
    ]),
  ],

  controllers: [UploadController, SagaEventHandler],
  providers: [UploadService, S3Service, SagaService],
})
export class AppModule {}
