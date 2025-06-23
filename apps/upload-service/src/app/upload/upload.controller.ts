// apps/upload-service/src/app/upload/upload.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  Body,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('files')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  /**
   * Upload a file
   * POST /api/files/upload
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, callback) => {
        // Allow common file types
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/pdf',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(new BadRequestException('File type not allowed'), false);
        }
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
      throw new BadRequestException('No file uploaded');
    }

    if (!body.userId) {
      throw new BadRequestException('userId is required');
    }

    this.logger.log(
      `📤 File upload request: ${file.originalname} (${file.size} bytes)`
    );

    try {
      const uploadDto = {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        userId: body.userId,
        orderId: body.orderId,
        category: body.category,
        tags: body.tags ? body.tags.split(',').map((tag) => tag.trim()) : [],
      };

      const result = await this.uploadService.uploadFile(
        file.buffer,
        uploadDto
      );

      return {
        success: true,
        data: result,
        message: 'File upload initiated successfully',
      };
    } catch (error: any) {
      this.logger.error(`❌ Upload failed: ${error.message}`);
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata by ID
   * GET /api/files/:id
   */
  @Get(':id')
  async getFile(@Param('id') fileId: string, @Query('userId') userId: string) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const file = await this.uploadService.getFileById(fileId);

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return {
      success: true,
      data: file,
    };
  }

  /**
   * Get user's files
   * GET /api/files?userId=123&limit=10&offset=0
   */
  @Get()
  async getUserFiles(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    const result = await this.uploadService.getFilesByUser(
      userId,
      parsedLimit,
      parsedOffset
    );

    return {
      success: true,
      data: {
        files: result.files,
        totalCount: result.total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  }

  /**
   * Get files by order ID
   * GET /api/files/order/:orderId?userId=123
   */
  @Get('order/:orderId')
  async getOrderFiles(
    @Param('orderId') orderId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    const files = await this.uploadService.getFilesByOrder(orderId);

    // Filter by userId for security
    const userFiles = files.filter((file) => file.userId === userId);

    return {
      success: true,
      data: {
        orderId,
        files: userFiles,
        count: userFiles.length,
      },
    };
  }

  /**
   * Get download URL for file
   * GET /api/files/:id/download?userId=123
   */
  @Get(':id/download')
  async getDownloadUrl(
    @Param('id') fileId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    try {
      const result = await this.uploadService.getDownloadUrl(fileId, userId);

      return {
        success: true,
        data: {
          downloadUrl: result.url,
          expiresIn: 3600, // 1 hour
        },
        message: 'Download URL generated successfully',
      };
    } catch (error: any) {
      if (error.message === 'File not found') {
        throw new NotFoundException('File not found');
      }
      if (error.message === 'Access denied') {
        throw new ForbiddenException('Access denied');
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Delete file
   * DELETE /api/files/:id?userId=123
   */
  @Delete(':id')
  async deleteFile(
    @Param('id') fileId: string,
    @Query('userId') userId: string
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }

    try {
      const result = await this.uploadService.deleteFile(fileId, userId);

      return {
        success: true,
        message: result.message,
      };
    } catch (error: any) {
      if (error.message === 'File not found') {
        throw new NotFoundException('File not found');
      }
      if (error.message === 'Access denied') {
        throw new ForbiddenException('Access denied');
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Health check endpoint
   * GET /api/files/health
   */
  @Get('health')
  async healthCheck() {
    return {
      success: true,
      service: 'upload-service',
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }
}
