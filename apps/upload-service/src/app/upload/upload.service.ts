// apps/upload-service/src/app/upload/upload.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientKafka } from '@nestjs/microservices';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { S3Service } from '../s3/s3.service';
import { SagaService } from '../saga/saga.service';
import {
  FileMetadata,
  FileMetadataDocument,
} from '../schemas/file-metadata.schema';
import {
  FileStatus,
  FileUploadSagaStartedEvent,
  FileS3UploadedEvent,
  FileMetadataSavedEvent,
  FileUploadCompletedEvent,
  FileUploadFailedEvent,
  KAFKA_TOPICS,
} from '@kafka-microservices/shared';

export interface UploadFileDto {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId: string;
  orderId?: string;
  category?: string;
  tags?: string[];
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectModel(FileMetadata.name)
    private fileMetadataModel: Model<FileMetadataDocument>,
    private s3Service: S3Service,
    private sagaService: SagaService,
    @Inject('KAFKA_SERVICE')
    private kafkaClient: ClientKafka
  ) {}

  /**
   * Main upload method - starts the saga
   */
  async uploadFile(
    file: Buffer,
    uploadDto: UploadFileDto
  ): Promise<{ fileId: string; sagaId: string; message: string }> {
    const fileId = uuidv4();

    this.logger.log(
      `🚀 Starting file upload for user ${uploadDto.userId}: ${uploadDto.fileName}`
    );

    try {
      // Step 1: Start the saga
      const sagaId = await this.sagaService.startFileUploadSaga({
        fileId,
        fileName: uploadDto.fileName,
        fileSize: uploadDto.fileSize,
        userId: uploadDto.userId,
        orderId: uploadDto.orderId,
      });

      // Step 2: Publish saga started event
      const sagaStartedEvent: FileUploadSagaStartedEvent = {
        sagaId,
        fileId,
        fileName: uploadDto.fileName,
        fileSize: uploadDto.fileSize,
        userId: uploadDto.userId,
        orderId: uploadDto.orderId,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(
        KAFKA_TOPICS.FILE_UPLOAD_SAGA_STARTED,
        sagaStartedEvent
      );

      // Step 3: Upload to S3 (first saga step)
      await this.executeS3Upload(sagaId, fileId, file, uploadDto);

      return {
        fileId,
        sagaId,
        message: 'File upload started successfully',
      };
    } catch (error: any) {
      this.logger.error(
        `❌ File upload failed for ${uploadDto.fileName}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Execute S3 upload step
   */
  private async executeS3Upload(
    sagaId: string,
    fileId: string,
    file: Buffer,
    uploadDto: UploadFileDto
  ): Promise<void> {
    try {
      this.logger.log(
        `📤 Uploading to S3: ${uploadDto.fileName} (saga: ${sagaId})`
      );

      // Upload to S3
      const s3Result = await this.s3Service.uploadFile(
        file,
        uploadDto.fileName,
        uploadDto.mimeType,
        uploadDto.userId,
        uploadDto.orderId
      );

      // Update saga state
      await this.sagaService.completeStep(sagaId, 'UPLOAD_TO_S3', {
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        url: s3Result.url,
      });

      // Publish S3 upload completed event
      const s3UploadedEvent: FileS3UploadedEvent = {
        sagaId,
        fileId,
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(KAFKA_TOPICS.FILE_S3_UPLOADED, s3UploadedEvent);

      // Move to next step: save metadata
      await this.executeMetadataSave(sagaId, fileId, uploadDto, s3Result);
    } catch (error: any) {
      this.logger.error(`❌ S3 upload failed: ${error.message}`);

      // Fail the saga
      await this.sagaService.failStep(sagaId, 'UPLOAD_TO_S3', error.message);

      // Publish failure event
      const failureEvent: FileUploadFailedEvent = {
        sagaId,
        fileId,
        stepName: 'UPLOAD_TO_S3',
        error: error.message,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(KAFKA_TOPICS.FILE_UPLOAD_FAILED, failureEvent);
      throw error;
    }
  }

  /**
   * Execute metadata save step
   */
  private async executeMetadataSave(
    sagaId: string,
    fileId: string,
    uploadDto: UploadFileDto,
    s3Result: { s3Key: string; s3Bucket: string; url: string }
  ): Promise<void> {
    try {
      this.logger.log(
        `💾 Saving metadata: ${uploadDto.fileName} (saga: ${sagaId})`
      );

      // Create file metadata document
      const fileMetadata = new this.fileMetadataModel({
        _id: fileId,
        fileName: uploadDto.fileName,
        originalName: uploadDto.fileName,
        fileSize: uploadDto.fileSize,
        mimeType: uploadDto.mimeType,
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        userId: uploadDto.userId,
        orderId: uploadDto.orderId,
        category: uploadDto.category,
        tags: uploadDto.tags,
        status: FileStatus.UPLOADED,
        uploadedAt: new Date(),
        versions: [
          {
            type: 'original',
            s3Key: s3Result.s3Key,
            fileSize: uploadDto.fileSize,
            createdAt: new Date(),
          },
        ],
      });

      await fileMetadata.save();

      // Update saga state
      await this.sagaService.completeStep(sagaId, 'SAVE_METADATA', {
        fileId,
        metadataSaved: true,
      });

      // Publish metadata saved event
      const metadataSavedEvent: FileMetadataSavedEvent = {
        sagaId,
        fileId,
        metadata: fileMetadata.toObject() as any,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(
        KAFKA_TOPICS.FILE_METADATA_SAVED,
        metadataSavedEvent
      );

      // Move to final step: complete saga
      await this.completeSaga(sagaId, fileId, s3Result.url);
    } catch (error: any) {
      this.logger.error(`❌ Metadata save failed: ${error.message}`);

      // Fail the saga and trigger compensation
      await this.sagaService.failStep(sagaId, 'SAVE_METADATA', error.message);
      await this.sagaService.startCompensation(sagaId);

      // Compensate: delete from S3
      await this.compensateS3Upload(sagaId, s3Result.s3Key);

      // Publish failure event
      const failureEvent: FileUploadFailedEvent = {
        sagaId,
        fileId,
        stepName: 'SAVE_METADATA',
        error: error.message,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(KAFKA_TOPICS.FILE_UPLOAD_FAILED, failureEvent);
      throw error;
    }
  }

  /**
   * Complete the saga
   */
  private async completeSaga(
    sagaId: string,
    fileId: string,
    fileUrl: string
  ): Promise<void> {
    try {
      this.logger.log(`✅ Completing saga: ${sagaId}`);

      // Update saga state (notification step is handled by notification service)
      await this.sagaService.completeStep(sagaId, 'SEND_NOTIFICATION');

      // Publish saga completed event
      const completedEvent: FileUploadCompletedEvent = {
        sagaId,
        fileId,
        fileUrl,
        timestamp: new Date(),
      };

      this.kafkaClient.emit(KAFKA_TOPICS.FILE_UPLOAD_COMPLETED, completedEvent);

      this.logger.log(`🎉 File upload saga completed: ${sagaId}`);
    } catch (error: any) {
      this.logger.error(`❌ Saga completion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Compensation: Delete file from S3
   */
  private async compensateS3Upload(
    sagaId: string,
    s3Key: string
  ): Promise<void> {
    try {
      this.logger.log(`🔄 Compensating S3 upload: ${s3Key} (saga: ${sagaId})`);

      await this.s3Service.deleteFile(s3Key);

      // Update compensation action as completed
      const saga = await this.sagaService.getSagaState(sagaId);
      const s3Step = saga?.steps?.find((s) => s.stepName === 'UPLOAD_TO_S3');

      if (s3Step) {
        await this.sagaService.completeCompensationAction(
          sagaId,
          s3Step.stepId || ''
        );
      }

      this.logger.log(`✅ S3 compensation completed: ${s3Key}`);
    } catch (error: any) {
      this.logger.error(`❌ S3 compensation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file metadata by ID
   */
  async getFileById(fileId: string): Promise<FileMetadataDocument | null> {
    return this.fileMetadataModel.findById(fileId);
  }

  /**
   * Get files by user ID
   */
  async getFilesByUser(
    userId: string,
    limit = 10,
    offset = 0
  ): Promise<{ files: FileMetadataDocument[]; total: number }> {
    const [files, total] = await Promise.all([
      this.fileMetadataModel
        .find({ userId })
        .sort({ uploadedAt: -1 })
        .limit(limit)
        .skip(offset),
      this.fileMetadataModel.countDocuments({ userId }),
    ]);

    return { files, total };
  }

  /**
   * Get files by order ID
   */
  async getFilesByOrder(orderId: string): Promise<FileMetadataDocument[]> {
    return this.fileMetadataModel.find({ orderId }).sort({ uploadedAt: -1 });
  }

  /**
   * Delete file (starts deletion saga)
   */
  async deleteFile(
    fileId: string,
    userId: string
  ): Promise<{ message: string }> {
    const file = await this.fileMetadataModel.findById(fileId);

    if (!file) {
      throw new Error('File not found');
    }

    if (file.userId !== userId) {
      throw new Error('Access denied');
    }

    // Update status to deleted
    file.status = FileStatus.DELETED;
    await file.save();

    // Delete from S3
    await this.s3Service.deleteFile(file.s3Key || '');

    this.logger.log(`🗑️ File deleted: ${fileId}`);

    return { message: 'File deleted successfully' };
  }

  /**
   * Get download URL for file
   */
  async getDownloadUrl(
    fileId: string,
    userId: string
  ): Promise<{ url: string }> {
    const file = await this.fileMetadataModel.findById(fileId);

    if (!file) {
      throw new Error('File not found');
    }

    if (file.userId !== userId) {
      throw new Error('Access denied');
    }

    if (file.status === FileStatus.DELETED) {
      throw new Error('File has been deleted');
    }

    const url = await this.s3Service.getPresignedUrl(file.s3Key || '');

    return { url };
  }
}
