import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { BrandProfile } from '../brand-profiles/entities/brand-profile.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { FileEntity } from '../files/entities/file.entity';
import { PostAsset } from '../files/entities/post-asset.entity';
import { FilesModule } from '../files/files.module';
import { Lead } from '../leads/entities/lead.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { TaskActivityLog } from '../tasks/entities/task-activity-log.entity';
import { TaskAttachment } from '../tasks/entities/task-attachment.entity';
import { Task } from '../tasks/entities/task.entity';
import {
  BrandProfileAttachmentsController,
  CampaignAttachmentsController,
  LeadAttachmentsController,
  PostAttachmentsController,
  TaskAttachmentsController,
} from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { EntityAttachment } from './entities/entity-attachment.entity';
import { OrphanFilesService } from './orphan-files.service';

/**
 * Files hung off records. One service, one table, five thin controllers.
 *
 * The parent repositories are registered here rather than the modules being
 * imported: this module only needs to ask "does this row exist on this
 * client", and importing five feature modules to ask that would tangle them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EntityAttachment,
      FileEntity,
      Task,
      TaskAttachment,
      TaskActivityLog,
      ContentPost,
      Campaign,
      Lead,
      BrandProfile,
      PostAsset,
    ]),
    MembershipsModule,
    FilesModule,
  ],
  controllers: [
    TaskAttachmentsController,
    PostAttachmentsController,
    CampaignAttachmentsController,
    LeadAttachmentsController,
    BrandProfileAttachmentsController,
  ],
  providers: [
    AttachmentsService,
    OrphanFilesService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
