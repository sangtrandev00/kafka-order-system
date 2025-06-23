// ==========================
// FILE UPLOAD SAGA EVENTS
// ==========================

import { FileMetadata } from './file.type';

export interface FileUploadSagaStartedEvent {
  sagaId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  userId: string;
  orderId?: string;
  timestamp: Date;
}

export interface FileS3UploadedEvent {
  sagaId: string;
  fileId: string;
  s3Key: string;
  s3Bucket: string;
  timestamp: Date;
}

export interface FileMetadataSavedEvent {
  sagaId: string;
  fileId: string;
  metadata: FileMetadata;
  timestamp: Date;
}

export interface FileUploadCompletedEvent {
  sagaId: string;
  fileId: string;
  fileUrl: string;
  timestamp: Date;
}

export interface FileUploadFailedEvent {
  sagaId: string;
  fileId: string;
  stepName: string;
  error: string;
  timestamp: Date;
}

export interface FileS3DeletedEvent {
  sagaId: string;
  fileId: string;
  s3Key: string;
  timestamp: Date;
}
