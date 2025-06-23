// apps/upload-service/src/app/saga/saga-event.handler.ts
import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { SagaService } from './saga.service';
import {
  FileUploadFailedEvent,
  FileS3DeletedEvent,
  KAFKA_TOPICS,
} from '@kafka-microservices/shared';

@Controller()
export class SagaEventHandler {
  private readonly logger = new Logger(SagaEventHandler.name);

  constructor(private readonly sagaService: SagaService) {}

  /**
   * Handle saga failure events from other services
   * This allows external services to fail our sagas
   */
  @EventPattern(KAFKA_TOPICS.FILE_UPLOAD_FAILED)
  async handleUploadFailure(@Payload() event: FileUploadFailedEvent) {
    this.logger.log(
      `🔴 Received upload failure event for saga: ${event.sagaId}`
    );

    try {
      // Start compensation process
      await this.sagaService.startCompensation(event.sagaId);

      this.logger.log(
        `🔄 Started compensation for failed saga: ${event.sagaId}`
      );
    } catch (error: any) {
      this.logger.error(`❌ Failed to start compensation: ${error.message}`);
    }
  }

  /**
   * Handle S3 deletion events (compensation confirmation)
   */
  @EventPattern(KAFKA_TOPICS.FILE_S3_DELETED)
  async handleS3Deletion(@Payload() event: FileS3DeletedEvent) {
    this.logger.log(
      `🗑️ Received S3 deletion confirmation for saga: ${event.sagaId}`
    );

    try {
      // Find the saga and mark S3 compensation as completed
      const saga = await this.sagaService.getSagaState(event.sagaId);

      if (saga) {
        const s3Step = saga.steps?.find((s) => s.stepName === 'UPLOAD_TO_S3');
        if (s3Step) {
          await this.sagaService.completeCompensationAction(
            event.sagaId,
            s3Step.stepId || ''
          );
          this.logger.log(
            `✅ S3 compensation completed for saga: ${event.sagaId}`
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to complete S3 compensation: ${error.message}`
      );
    }
  }
}
