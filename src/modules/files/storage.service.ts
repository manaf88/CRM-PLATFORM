import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('storage.bucket');

    this.s3Client = new S3Client({
      region: this.configService.getOrThrow<string>('storage.region'),
      endpoint: this.configService.getOrThrow<string>('storage.endpoint'),
      forcePathStyle: this.configService.getOrThrow<boolean>(
        'storage.forcePathStyle',
      ),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('storage.accessKey'),
        secretAccessKey:
          this.configService.getOrThrow<string>('storage.secretKey'),
      },
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  getBucket(): string {
    return this.bucket;
  }

  async uploadFile(input: {
    key: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );
  }

  async getSignedDownloadUrl(
    storageKey: string,
    expiresInSeconds = 60 * 10,
    presentation?: {
      disposition: 'attachment' | 'inline';
      fileName: string;
      mimeType: string;
    },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      // Signed into the URL, so the browser is told how to treat the file
      // without the API having to proxy the bytes.
      ...(presentation
        ? {
            ResponseContentDisposition: `${presentation.disposition}; filename="${presentation.fileName.replace(/"/g, '')}"`,
            ResponseContentType: presentation.mimeType,
          }
        : {}),
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Real connectivity check for the Super Admin health endpoint (BE-23).
   * Reports on the bucket actually answering, not on the env vars existing.
   */
  /** Used when the last reference to a file goes away. */
  async deleteObject(storageKey: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );

      return true;
    } catch {
      return false;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
    } catch {
      try {
        await this.s3Client.send(
          new CreateBucketCommand({
            Bucket: this.bucket,
          }),
        );
      } catch {
        throw new InternalServerErrorException(
          'Could not initialize storage bucket',
        );
      }
    }
  }
}
