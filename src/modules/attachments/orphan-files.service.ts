import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AttachmentsService } from './attachments.service';

/**
 * Files nobody claimed.
 *
 * Attaching happens in two steps — upload, then attach — so a form somebody
 * abandons leaves a file in the bucket with nothing pointing at it. Anything
 * older than a day with no references is swept up nightly.
 */
@Injectable()
export class OrphanFilesService {
  private readonly logger = new Logger(OrphanFilesService.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Cron('30 3 * * *', { name: 'orphan-files' })
  async sweep(): Promise<number> {
    const deleted = await this.attachmentsService.deleteOrphanedFiles(24);

    this.logger.log(`Orphan sweep: ${deleted} files removed`);

    return deleted;
  }
}
