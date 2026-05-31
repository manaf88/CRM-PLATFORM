import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { FileEntity } from './entities/file.entity';
import { StorageService } from './storage.service';

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
]);

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    private readonly storageService: StorageService,
  ) {}

  async uploadCompanyFile(
    companyId: string,
    file: Express.Multer.File,
    currentUser: RequestUser,
  ): Promise<FileEntity> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    this.validateFile(file);

    const storageKey = this.buildStorageKey(companyId, file.originalname);

    await this.storageService.uploadFile({
      key: storageKey,
      buffer: file.buffer,
      mimeType: file.mimetype,
    });

    const fileEntity = this.filesRepository.create({
      companyId,
      uploadedById: currentUser.id,
      storageKey,
      bucket: this.storageService.getBucket(),
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });

    return this.filesRepository.save(fileEntity);
  }

  async findOne(companyId: string, fileId: string): Promise<FileEntity> {
    const file = await this.filesRepository.findOne({
      where: {
        id: fileId,
        companyId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  async getDownloadUrl(companyId: string, fileId: string) {
    const file = await this.findOne(companyId, fileId);

    const url = await this.storageService.getSignedDownloadUrl(
      file.storageKey,
    );

    return {
      url,
      expiresInSeconds: 600,
    };
  }

  private validateFile(file: Express.Multer.File): void {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size exceeds 20MB limit');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}`,
      );
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
  }

  private buildStorageKey(companyId: string, originalName: string): string {
    const extension = this.extractExtension(originalName);

    return `companies/${companyId}/${randomUUID()}${extension}`;
  }

  private extractExtension(originalName: string): string {
    const lastDotIndex = originalName.lastIndexOf('.');

    if (lastDotIndex === -1) {
      return '';
    }

    return originalName.slice(lastDotIndex).toLowerCase();
  }
}