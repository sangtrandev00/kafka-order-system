// apps/upload-service/src/app/schemas/file-metadata.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { FileStatus } from '@kafka-microservices/shared';

export type FileMetadataDocument = FileMetadata & Document;

@Schema({ timestamps: true })
export class FileMetadata {
  @Prop({ required: true })
  fileName?: string;

  @Prop({ required: true })
  originalName?: string;

  @Prop({ required: true })
  fileSize?: number;

  @Prop({ required: true })
  mimeType?: string;

  @Prop({ required: true })
  s3Key?: string;

  @Prop({ required: true })
  s3Bucket?: string;

  @Prop({ required: true })
  userId?: string;

  @Prop()
  orderId?: string;

  @Prop()
  category?: string;

  @Prop([String])
  tags?: string[];

  @Prop({
    type: String,
    enum: Object.values(FileStatus),
    default: FileStatus.UPLOADING,
  })
  status?: FileStatus;

  @Prop({ default: Date.now })
  uploadedAt?: Date;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop([
    {
      type: {
        type: String,
        enum: ['original', 'thumbnail', 'compressed'],
        required: true,
      },
      s3Key: { type: String, required: true },
      fileSize: { type: Number, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ])
  versions?: Array<{
    type: 'original' | 'thumbnail' | 'compressed';
    s3Key: string;
    fileSize: number;
    createdAt: Date;
  }>;
}

export const FileMetadataSchema = SchemaFactory.createForClass(FileMetadata);

// Create indexes for better performance
FileMetadataSchema.index({ userId: 1, uploadedAt: -1 });
FileMetadataSchema.index({ orderId: 1 });
FileMetadataSchema.index({ status: 1 });
FileMetadataSchema.index({ s3Key: 1 }, { unique: true });
