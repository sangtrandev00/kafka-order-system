export interface FileUploadDto {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId: string;
  orderId?: string;
  category?: string;
  tags?: string[];
}

export interface FileMetadata {
  _id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  s3Key: string;
  s3Bucket: string;
  userId: string;
  orderId?: string;
  category?: string;
  tags?: string[];
  status: FileStatus;
  uploadedAt: Date;
  metadata?: Record<string, any>;
  versions?: FileVersion[];
}

export interface FileVersion {
  type: 'original' | 'thumbnail' | 'compressed';
  s3Key: string;
  fileSize: number;
  createdAt: Date;
}

export enum FileStatus {
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  DELETED = 'DELETED',
}
