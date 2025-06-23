// apps/upload-service/src/app/schemas/saga-state.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SagaType, SagaStatus, StepStatus } from '@kafka-microservices/shared';

export type SagaStateDocument = SagaState & Document;

@Schema()
export class SagaStep {
  @Prop({ required: true })
  stepId?: string;

  @Prop({ required: true })
  stepName?: string;

  @Prop({
    type: String,
    enum: Object.values(StepStatus),
    default: StepStatus.PENDING,
  })
  status?: StepStatus;

  @Prop({ type: Object })
  payload?: Record<string, any>;

  @Prop()
  error?: string;

  @Prop({ default: Date.now })
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  failedAt?: Date;
}

@Schema()
export class CompensationAction {
  @Prop({ required: true })
  stepId?: string;

  @Prop({ required: true })
  action?: string;

  @Prop({ type: Object, required: true })
  payload?: Record<string, any>;

  @Prop({
    type: String,
    enum: Object.values(StepStatus),
    default: StepStatus.PENDING,
  })
  status?: StepStatus;

  @Prop()
  executedAt?: Date;
}

@Schema({ timestamps: true })
export class SagaState {
  @Prop({ required: true, unique: true, index: true }) // Fixed: explicit index
  sagaId?: string;

  @Prop({
    type: String,
    enum: Object.values(SagaType),
    required: true,
  })
  sagaType?: SagaType;

  @Prop({
    type: String,
    enum: Object.values(SagaStatus),
    default: SagaStatus.STARTED,
  })
  status?: SagaStatus;

  @Prop([SagaStep])
  steps?: SagaStep[];

  @Prop({ type: Object, required: true })
  payload?: Record<string, any>;

  @Prop([CompensationAction])
  compensationActions?: CompensationAction[];

  @Prop({ default: Date.now })
  createdAt?: Date;

  @Prop({ default: Date.now })
  updatedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  failedAt?: Date;
}

export const SagaStateSchema = SchemaFactory.createForClass(SagaState);

// Create indexes manually to avoid duplicate warnings
SagaStateSchema.index({ sagaType: 1, status: 1 });
SagaStateSchema.index({ createdAt: -1 });
