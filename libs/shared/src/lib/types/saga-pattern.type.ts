// ==========================
// SAGA PATTERN TYPES
// ==========================

export interface SagaState {
  _id: string;
  sagaId: string;
  sagaType: SagaType;
  status: SagaStatus;
  steps: SagaStep[];
  payload: Record<string, any>;
  compensationActions: CompensationAction[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
}

export enum SagaType {
  FILE_UPLOAD = 'FILE_UPLOAD',
  ORDER_PROCESSING = 'ORDER_PROCESSING',
}

export enum SagaStatus {
  STARTED = 'STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATING = 'COMPENSATING',
  COMPENSATED = 'COMPENSATED',
}

export interface SagaStep {
  stepId: string;
  stepName: string;
  status: StepStatus;
  payload?: Record<string, any>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
}

export enum StepStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  COMPENSATED = 'COMPENSATED',
}

export interface CompensationAction {
  stepId: string;
  action: string;
  payload: Record<string, any>;
  status: StepStatus;
  executedAt?: Date;
}
