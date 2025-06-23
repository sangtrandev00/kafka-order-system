// apps/upload-service/src/app/saga/saga.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { SagaType, SagaStatus, StepStatus } from '@kafka-microservices/shared';
import { SagaState, SagaStateDocument } from '../schemas/saga-state.schema';

@Injectable()
export class SagaService {
  private readonly logger = new Logger(SagaService.name);

  constructor(
    @InjectModel(SagaState.name)
    private sagaStateModel: Model<SagaStateDocument>
  ) {}

  /**
   * Start a new file upload saga
   */
  async startFileUploadSaga(payload: {
    fileId: string;
    fileName: string;
    fileSize: number;
    userId: string;
    orderId?: string;
  }): Promise<string> {
    const sagaId = uuidv4();

    // Define the steps for file upload saga
    const steps = [
      {
        stepId: uuidv4(),
        stepName: 'UPLOAD_TO_S3',
        status: StepStatus.PENDING,
        startedAt: new Date(),
      },
      {
        stepId: uuidv4(),
        stepName: 'SAVE_METADATA',
        status: StepStatus.PENDING,
        startedAt: new Date(),
      },
      {
        stepId: uuidv4(),
        stepName: 'SEND_NOTIFICATION',
        status: StepStatus.PENDING,
        startedAt: new Date(),
      },
    ];

    const sagaState = new this.sagaStateModel({
      sagaId,
      sagaType: SagaType.FILE_UPLOAD,
      status: SagaStatus.STARTED,
      steps,
      payload,
      compensationActions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await sagaState.save();

    this.logger.log(`🚀 File upload saga started: ${sagaId}`);
    return sagaId;
  }

  /**
   * Mark a step as completed
   */
  async completeStep(
    sagaId: string,
    stepName: string,
    payload?: Record<string, any>
  ): Promise<void> {
    const saga = await this.sagaStateModel.findOne({ sagaId });

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    // Find and update the step
    const step = saga.steps?.find((s: any) => s.stepName === stepName);
    if (!step) {
      throw new Error(`Step not found: ${stepName} in saga ${sagaId}`);
    }

    step.status = StepStatus.COMPLETED;
    step.completedAt = new Date();
    if (payload) {
      step.payload = { ...step.payload, ...payload };
    }

    // Update saga status
    saga.status = SagaStatus.IN_PROGRESS;
    saga.updatedAt = new Date();

    // Check if all steps are completed
    const allCompleted = saga.steps?.every(
      (s: any) => s.status === StepStatus.COMPLETED
    );
    if (allCompleted) {
      saga.status = SagaStatus.COMPLETED;
      saga.completedAt = new Date();
      this.logger.log(`✅ Saga completed: ${sagaId}`);
    }

    await saga.save();

    this.logger.log(`✅ Step completed: ${stepName} in saga ${sagaId}`);
  }

  /**
   * Mark a step as failed and trigger compensation
   */
  async failStep(
    sagaId: string,
    stepName: string,
    error: string
  ): Promise<void> {
    const saga = await this.sagaStateModel.findOne({ sagaId });

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    // Find and update the failed step
    const step = saga.steps?.find((s: any) => s.stepName === stepName);
    if (!step) {
      throw new Error(`Step not found: ${stepName} in saga ${sagaId}`);
    }

    step.status = StepStatus.FAILED;
    step.failedAt = new Date();
    step.error = error;

    // Update saga status to failed
    saga.status = SagaStatus.FAILED;
    saga.failedAt = new Date();
    saga.updatedAt = new Date();

    // Create compensation actions for completed steps
    await this.createCompensationActions(saga);

    await saga.save();

    this.logger.error(
      `❌ Step failed: ${stepName} in saga ${sagaId} - ${error}`
    );
  }

  /**
   * Start compensation process
   */
  async startCompensation(sagaId: string): Promise<void> {
    const saga = await this.sagaStateModel.findOne({ sagaId });

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    saga.status = SagaStatus.COMPENSATING;
    saga.updatedAt = new Date();

    await saga.save();

    this.logger.log(`🔄 Starting compensation for saga: ${sagaId}`);
  }

  /**
   * Mark compensation as completed
   */
  async completeCompensation(sagaId: string): Promise<void> {
    const saga = await this.sagaStateModel.findOne({ sagaId });

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    saga.status = SagaStatus.COMPENSATED;
    saga.updatedAt = new Date();

    await saga.save();

    this.logger.log(`✅ Compensation completed for saga: ${sagaId}`);
  }

  /**
   * Get saga state
   */
  async getSagaState(sagaId: string): Promise<SagaStateDocument | null> {
    return this.sagaStateModel.findOne({ sagaId });
  }

  /**
   * Get all active sagas (for monitoring)
   */
  async getActiveSagas(): Promise<SagaStateDocument[]> {
    return this.sagaStateModel
      .find({
        status: {
          $in: [
            SagaStatus.STARTED,
            SagaStatus.IN_PROGRESS,
            SagaStatus.COMPENSATING,
          ],
        },
      })
      .sort({ createdAt: -1 });
  }

  /**
   * Create compensation actions based on completed steps
   */
  private async createCompensationActions(
    saga: SagaStateDocument
  ): Promise<void> {
    const completedSteps = saga.steps?.filter(
      (s: any) => s.status === StepStatus.COMPLETED
    );

    // Create compensation actions in reverse order
    const compensationActions = completedSteps?.reverse().map((step: any) => {
      let action = '';
      let compensationPayload = {};

      switch (step.stepName) {
        case 'UPLOAD_TO_S3':
          action = 'DELETE_FROM_S3';
          compensationPayload = {
            s3Key: step.payload?.s3Key,
            s3Bucket: step.payload?.s3Bucket,
          };
          break;

        case 'SAVE_METADATA':
          action = 'DELETE_METADATA';
          compensationPayload = {
            fileId: saga.payload?.fileId,
          };
          break;

        case 'SEND_NOTIFICATION':
          action = 'SEND_FAILURE_NOTIFICATION';
          compensationPayload = {
            userId: saga.payload?.userId,
            fileName: saga.payload?.fileName,
          };
          break;
      }

      return {
        stepId: step.stepId,
        action,
        payload: compensationPayload,
        status: StepStatus.PENDING,
      };
    });

    saga.compensationActions = compensationActions;

    this.logger.log(
      `Created ${compensationActions?.length} compensation actions for saga: ${saga.sagaId}`
    );
  }

  /**
   * Mark compensation action as completed
   */
  async completeCompensationAction(
    sagaId: string,
    stepId: string
  ): Promise<void> {
    const saga = await this.sagaStateModel.findOne({ sagaId });

    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    const compensationAction = saga.compensationActions?.find(
      (ca: any) => ca.stepId === stepId
    );
    if (!compensationAction) {
      throw new Error(
        `Compensation action not found: ${stepId} in saga ${sagaId}`
      );
    }

    compensationAction.status = StepStatus.COMPLETED;
    compensationAction.executedAt = new Date();

    // Check if all compensation actions are completed
    const allCompensated = saga.compensationActions?.every(
      (ca: any) => ca.status === StepStatus.COMPLETED
    );
    if (allCompensated) {
      saga.status = SagaStatus.COMPENSATED;
    }

    saga.updatedAt = new Date();
    await saga.save();

    this.logger.log(
      `✅ Compensation action completed: ${compensationAction.action} for saga ${sagaId}`
    );
  }
}
