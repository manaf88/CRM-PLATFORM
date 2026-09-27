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

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * What work actually arrives as: pictures, documents, the odd video, and a
 * zip of a logo pack. Anything executable is refused — this list is an
 * allowlist for that reason, not a formality.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  // Office documents, old and new.
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  // Logo packs and the like.
  'application/zip',
  'application/x-zip-compressed',
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

  /**
   * A link to the file. `inline` asks the browser to render it — images and
   * PDFs open in a tab instead of landing in the downloads folder — which is
   * what a preview pane needs.
   */
  async getDownloadUrl(
    companyId: string,
    fileId: string,
    disposition: 'attachment' | 'inline' = 'attachment',
  ) {
    const file = await this.findOne(companyId, fileId);

    const expiresInSeconds = 15 * 60;

    const url = await this.storageService.getSignedDownloadUrl(
      file.storageKey,
      expiresInSeconds,
      {
        disposition,
        fileName: file.originalName,
        mimeType: file.mimeType,
      },
    );

    return {
      url,
      expiresInSeconds,
      disposition,
    };
  }

  private validateFile(file: Express.Multer.File): void {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size exceeds 25MB limit');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
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
