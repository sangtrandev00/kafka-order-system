// apps/order-gateway/src/app/upload/upload-proxy.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('files')
export class UploadProxyController {
  private readonly logger = new Logger(UploadProxyController.name);

  constructor(
    @Inject('UPLOAD_SERVICE')
    private readonly uploadServiceClient: ClientProxy
  ) {}

  /**
   * Get files associated with a specific order
   * GET /api/orders/:orderId/files
   */
  @Get('/orders/:orderId/files')
  async getOrderFiles(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`📋 Proxying get order files: ${orderId}`);

    try {
      // In real implementation, make HTTP call to upload service
      const response = {
        success: true,
        data: {
          orderId,
          files: [],
          count: 0,
        },
      };

      return response;
    } catch (error: any) {
      this.logger.error(`❌ Get order files proxy failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Proxy file upload to upload service
   * POST /api/files/upload
   */

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    })
  )
  async uploadFile(
    @UploadedFile() file: any,
    @Body()
    body: {
      userId: string;
      orderId?: string;
      category?: string;
      tags?: string;
    }
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    if (!body.userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `📤 Proxying file upload: ${file.originalname} to upload service`
    );

    try {
      // Forward the request to upload service
      // Note: In a real implementation, you'd use HTTP client to call upload service
      // For now, we'll return a response indicating the upload was initiated

      const uploadResponse = {
        success: true,
        data: {
          fileId: 'generated-file-id',
          sagaId: 'generated-saga-id',
          message: 'File upload initiated successfully',
        },
        message: 'File upload request received and forwarded to upload service',
      };

      return uploadResponse;
    } catch (error: any) {
      this.logger.error(`❌ Upload proxy failed: ${error.message}`);
      throw new HttpException(
        `Upload failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Proxy get file by ID
   * GET /api/files/:id
   */
  @Get(':id')
  async getFile(@Param('id') fileId: string, @Query('userId') userId: string) {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`📄 Proxying get file request: ${fileId}`);

    try {
      // In real implementation, make HTTP call to upload service
      const response = {
        success: true,
        data: {
          _id: fileId,
          fileName: 'example.pdf',
          userId,
          status: 'UPLOADED',
          uploadedAt: new Date(),
        },
      };

      return response;
    } catch (error: any) {
      this.logger.error(`❌ Get file proxy failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Proxy get user files
   * GET /api/files?userId=123
   */
  @Get()
  async getUserFiles(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    this.logger.log(`📋 Proxying get user files: ${userId}`);

    try {
      // In real implementation, make HTTP call to upload service
      const response = {
        success: true,
        data: {
          files: [],
          totalCount: 0,
          limit: parsedLimit,
          offset: parsedOffset,
        },
      };

      return response;
    } catch (error: any) {
      this.logger.error(`❌ Get user files proxy failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Proxy get download URL
   * GET /api/files/:id/download
   */
  @Get(':id/download')
  async getDownloadUrl(
    @Param('id') fileId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`🔗 Proxying download URL request: ${fileId}`);

    try {
      // In real implementation, make HTTP call to upload service
      const response = {
        success: true,
        data: {
          downloadUrl: `https://presigned-url-for-${fileId}`,
          expiresIn: 3600,
        },
        message: 'Download URL generated successfully',
      };

      return response;
    } catch (error: any) {
      this.logger.error(`❌ Get download URL proxy failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Proxy delete file
   * DELETE /api/files/:id
   */
  @Delete(':id')
  async deleteFile(
    @Param('id') fileId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new HttpException('userId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`🗑️ Proxying delete file request: ${fileId}`);

    try {
      // In real implementation, make HTTP call to upload service
      const response = {
        success: true,
        message: 'File deleted successfully',
      };

      return response;
    } catch (error: any) {
      this.logger.error(`❌ Delete file proxy failed: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
