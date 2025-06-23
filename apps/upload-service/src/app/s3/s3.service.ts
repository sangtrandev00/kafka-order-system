// apps/upload-service/src/app/s3/s3.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: AWS.S3;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    // Configure AWS S3
    AWS.config.update({
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      region: this.configService.get('AWS_REGION', 'us-east-1'),
    });

    this.s3 = new AWS.S3({
      // For local development with LocalStack
      endpoint: this.configService.get('S3_ENDPOINT'),
      s3ForcePathStyle: !!this.configService.get('S3_ENDPOINT'),
    });

    this.bucketName = this.configService.get(
      'S3_BUCKET',
      'kafka-microservices-uploads'
    );
  }

  /**
   * Upload file to S3
   * Creates a unique S3 key to prevent conflicts
   */
  async uploadFile(
    file: Buffer,
    originalName: string,
    mimeType: string,
    userId: string,
    orderId?: string
  ): Promise<{ s3Key: string; s3Bucket: string; url: string }> {
    try {
      // Generate unique file name
      const fileExtension = originalName.split('.').pop();
      const fileName = `${uuidv4()}.${fileExtension}`;

      // Create S3 key with organized folder structure
      const s3Key = this.generateS3Key(fileName, userId, orderId);

      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file,
        ContentType: mimeType,
        Metadata: {
          originalName,
          userId,
          orderId: orderId || '',
          uploadedAt: new Date().toISOString(),
        },
      };

      this.logger.log(`Uploading file to S3: ${s3Key}`);

      const result = await this.s3.upload(uploadParams).promise();

      this.logger.log(`File uploaded successfully: ${result.Location}`);

      return {
        s3Key,
        s3Bucket: this.bucketName,
        url: result.Location,
      };
    } catch (error: any) {
      this.logger.error(`S3 upload failed: ${error.message}`, error.stack);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Delete file from S3 (for compensation)
   */
  async deleteFile(s3Key: string): Promise<void> {
    try {
      const deleteParams: AWS.S3.DeleteObjectRequest = {
        Bucket: this.bucketName,
        Key: s3Key,
      };

      this.logger.log(`Deleting file from S3: ${s3Key}`);

      await this.s3.deleteObject(deleteParams).promise();

      this.logger.log(`File deleted successfully: ${s3Key}`);
    } catch (error: any) {
      this.logger.error(`S3 delete failed: ${error.message}`, error.stack);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Get presigned URL for file download
   */
  async getPresignedUrl(s3Key: string, expiresIn = 3600): Promise<string> {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: s3Key,
        Expires: expiresIn, // URL expires in 1 hour by default
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error: any) {
      this.logger.error(
        `Failed to generate presigned URL: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(s3Key: string): Promise<boolean> {
    try {
      await this.s3
        .headObject({
          Bucket: this.bucketName,
          Key: s3Key,
        })
        .promise();

      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate organized S3 key structure
   * Format: uploads/userId/year/month/orderId?/fileName
   */
  private generateS3Key(
    fileName: string,
    userId: string,
    orderId?: string
  ): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    let s3Key = `uploads/${userId}/${year}/${month}`;

    if (orderId) {
      s3Key += `/${orderId}`;
    }

    s3Key += `/${fileName}`;

    return s3Key;
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(s3Key: string): Promise<AWS.S3.HeadObjectOutput> {
    try {
      const result = await this.s3
        .headObject({
          Bucket: this.bucketName,
          Key: s3Key,
        })
        .promise();

      return result;
    } catch (error: any) {
      this.logger.error(
        `Failed to get file metadata: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }
}
