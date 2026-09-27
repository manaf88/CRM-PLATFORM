import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { BrandProfile } from '../brand-profiles/entities/brand-profile.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { FileEntity } from '../files/entities/file.entity';
import { PostAsset } from '../files/entities/post-asset.entity';
import { Lead } from '../leads/entities/lead.entity';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { StorageService } from '../files/storage.service';
import { TaskActivityLog } from '../tasks/entities/task-activity-log.entity';
import { TaskAttachment } from '../tasks/entities/task-attachment.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskActivityAction } from '../tasks/enums/task-activity-action.enum';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { EntityAttachment } from './entities/entity-attachment.entity';
import { AttachmentEntityType } from './enums/attachment-entity-type.enum';
import { AttachmentErrorCode } from './enums/attachment-error-code.enum';

export const MAX_ATTACHMENTS_PER_ENTITY = 20;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @InjectRepository(EntityAttachment)
    private readonly attachmentsRepository: Repository<EntityAttachment>,

    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,

    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,

    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,

    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,

    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(BrandProfile)
    private readonly brandProfilesRepository: Repository<BrandProfile>,

    @InjectRepository(TaskAttachment)
    private readonly taskAttachmentsRepository: Repository<TaskAttachment>,

    @InjectRepository(PostAsset)
    private readonly postAssetsRepository: Repository<PostAsset>,

    @InjectRepository(TaskActivityLog)
    private readonly taskActivityLogsRepository: Repository<TaskActivityLog>,

    private readonly membershipsService: MembershipsService,
    private readonly storageService: StorageService,
  ) {}

  async list(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ) {
    const resolvedId = await this.resolveEntityId(
      companyId,
      entityType,
      entityId,
    );

    const attachments = await this.attachmentsRepository.find({
      where: {
        companyId,
        entityType,
        entityId: resolvedId,
      },
      relations: {
        file: true,
        uploadedBy: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    return attachments.map((attachment) => this.toView(attachment));
  }

  async add(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    dto: CreateAttachmentDto,
    currentUser: RequestUser,
  ) {
    const resolvedId = await this.resolveEntityId(
      companyId,
      entityType,
      entityId,
    );

    const attachment = await this.attach(
      this.attachmentsRepository.manager,
      {
        companyId,
        entityType,
        entityId: resolvedId,
        fileId: dto.fileId,
        label: dto.label ?? null,
        uploadedById: currentUser.id,
      },
    );

    await this.logTaskActivity(
      entityType,
      resolvedId,
      companyId,
      currentUser.id,
      TaskActivityAction.ATTACHMENT_ADDED,
      { attachmentId: attachment.id, fileId: dto.fileId },
    );

    const saved = await this.attachmentsRepository.findOne({
      where: { id: attachment.id },
      relations: { file: true, uploadedBy: true },
    });

    return this.toView(saved as EntityAttachment);
  }

  /**
   * Attaching several files as part of creating the parent record. Runs in
   * the caller's transaction so a failed create leaves no attachment rows.
   */
  async attachMany(
    manager: EntityManager,
    input: {
      companyId: string;
      entityType: AttachmentEntityType;
      entityId: string;
      fileIds: string[];
      uploadedById: string;
    },
  ): Promise<void> {
    const fileIds = [...new Set(input.fileIds)];

    if (fileIds.length === 0) {
      return;
    }

    if (fileIds.length > MAX_ATTACHMENTS_PER_ENTITY) {
      throw this.limitError(fileIds.length);
    }

    for (const fileId of fileIds) {
      await this.attach(manager, {
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        fileId,
        label: null,
        uploadedById: input.uploadedById,
      });
    }
  }

  async remove(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
    attachmentId: string,
    currentUser: RequestUser,
  ): Promise<void> {
    const resolvedId = await this.resolveEntityId(
      companyId,
      entityType,
      entityId,
    );

    const attachment = await this.attachmentsRepository.findOne({
      where: {
        id: attachmentId,
        companyId,
        entityType,
        entityId: resolvedId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    await this.assertMayDelete(companyId, attachment, currentUser);

    await this.attachmentsRepository.remove(attachment);

    await this.logTaskActivity(
      entityType,
      resolvedId,
      companyId,
      currentUser.id,
      TaskActivityAction.ATTACHMENT_REMOVED,
      { attachmentId, fileId: attachment.fileId },
    );

    // The same file can hang off a task and its post. It only leaves storage
    // when the last thing pointing at it lets go.
    await this.deleteFileIfOrphaned(attachment.fileId);
  }

  /**
   * Files nothing points at any more. Older than a day, so a file uploaded
   * from a form somebody has not submitted yet is left alone.
   */
  async deleteOrphanedFiles(olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const candidates = await this.filesRepository
      .createQueryBuilder('file')
      .where('file.createdAt < :cutoff', { cutoff })
      .limit(500)
      .getMany();

    let deleted = 0;

    for (const file of candidates) {
      if (await this.deleteFileIfOrphaned(file.id)) {
        deleted += 1;
      }
    }

    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} orphaned files`);
    }

    return deleted;
  }

  private async attach(
    manager: EntityManager,
    input: {
      companyId: string;
      entityType: AttachmentEntityType;
      entityId: string;
      fileId: string;
      label: string | null;
      uploadedById: string;
    },
  ): Promise<EntityAttachment> {
    const repository = manager.getRepository(EntityAttachment);

    const file = await manager.getRepository(FileEntity).findOne({
      where: { id: input.fileId, companyId: input.companyId },
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: AttachmentErrorCode.FILE_TOO_LARGE,
        message: 'Attachments are limited to 25MB',
        sizeBytes: file.sizeBytes,
        maxBytes: MAX_ATTACHMENT_BYTES,
      });
    }

    const existing = await repository.findOne({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        fileId: input.fileId,
      },
    });

    if (existing) {
      return existing;
    }

    const count = await repository.count({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });

    if (count >= MAX_ATTACHMENTS_PER_ENTITY) {
      throw this.limitError(count + 1);
    }

    return repository.save(repository.create(input));
  }

  /**
   * The brand profile has one row per client and no id in its URL, so the
   * route passes the company and the row is looked up here.
   */
  private async resolveEntityId(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<string> {
    if (entityType === AttachmentEntityType.BRAND_PROFILE) {
      const profile = await this.brandProfilesRepository.findOne({
        where: { companyId },
      });

      if (!profile) {
        throw new NotFoundException(
          'This client has no brand profile yet',
        );
      }

      return profile.id;
    }

    const exists = await this.parentExists(companyId, entityType, entityId);

    if (!exists) {
      throw new NotFoundException('Record not found');
    }

    return entityId;
  }

  private async parentExists(
    companyId: string,
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<boolean> {
    const where = { id: entityId, companyId };

    switch (entityType) {
      case AttachmentEntityType.TASK:
        return (await this.tasksRepository.count({ where })) > 0;
      case AttachmentEntityType.POST:
        return (await this.postsRepository.count({ where })) > 0;
      case AttachmentEntityType.CAMPAIGN:
        return (await this.campaignsRepository.count({ where })) > 0;
      case AttachmentEntityType.LEAD:
        return (await this.leadsRepository.count({ where })) > 0;
      default:
        return false;
    }
  }

  /**
   * The person who attached it can take it back; so can an account manager
   * or a platform admin, who are the people asked to remove something that
   * should not have been shared.
   */
  private async assertMayDelete(
    companyId: string,
    attachment: EntityAttachment,
    currentUser: RequestUser,
  ): Promise<void> {
    if (
      attachment.uploadedById === currentUser.id ||
      currentUser.platformRole === PlatformRole.SUPER_ADMIN ||
      currentUser.platformRole === PlatformRole.AGENCY_ADMIN
    ) {
      return;
    }

    const roles = await this.membershipsService.findActiveMembershipRoles(
      currentUser.id,
      companyId,
    );

    if (roles.includes(CompanyMembershipRole.ACCOUNT_MANAGER)) {
      return;
    }

    throw new ForbiddenException(
      'Only the person who attached this file, or an account manager, can remove it',
    );
  }

  /** True when the file was actually deleted. */
  private async deleteFileIfOrphaned(fileId: string): Promise<boolean> {
    const [attachments, legacyTaskAttachments, postAssets] = await Promise.all([
      this.attachmentsRepository.count({ where: { fileId } }),
      this.taskAttachmentsRepository.count({ where: { fileId } }),
      this.postAssetsRepository.count({ where: { fileId } }),
    ]);

    if (attachments + legacyTaskAttachments + postAssets > 0) {
      return false;
    }

    const file = await this.filesRepository.findOne({ where: { id: fileId } });

    if (!file) {
      return false;
    }

    try {
      await this.storageService.deleteObject(file.storageKey);
    } catch (error) {
      // A file the bucket has already lost should still leave the database.
      this.logger.warn(
        `Could not delete ${file.storageKey} from storage: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.filesRepository.remove(file);

    return true;
  }

  private async logTaskActivity(
    entityType: AttachmentEntityType,
    entityId: string,
    companyId: string,
    userId: string,
    action: TaskActivityAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (entityType !== AttachmentEntityType.TASK) {
      return;
    }

    await this.taskActivityLogsRepository.save(
      this.taskActivityLogsRepository.create({
        companyId,
        taskId: entityId,
        userId,
        action,
        metadata,
      }),
    );
  }

  private limitError(count: number) {
    return new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      code: AttachmentErrorCode.ATTACHMENT_LIMIT,
      message: `A record can hold ${MAX_ATTACHMENTS_PER_ENTITY} attachments`,
      attempted: count,
      max: MAX_ATTACHMENTS_PER_ENTITY,
    });
  }

  private toView(attachment: EntityAttachment) {
    return {
      id: attachment.id,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      label: attachment.label,
      uploadedById: attachment.uploadedById,
      uploadedBy: attachment.uploadedBy
        ? {
            id: attachment.uploadedBy.id,
            fullName: attachment.uploadedBy.fullName,
          }
        : null,
      createdAt: attachment.createdAt,
      file: attachment.file
        ? {
            id: attachment.file.id,
            originalName: attachment.file.originalName,
            mimeType: attachment.file.mimeType,
            size: attachment.file.sizeBytes,
          }
        : null,
    };
  }

  /** Used by the create paths to reject a silly number of ids early. */
  static assertFileIdCount(fileIds: string[] | undefined): void {
    if (fileIds && fileIds.length > MAX_ATTACHMENTS_PER_ENTITY) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: AttachmentErrorCode.ATTACHMENT_LIMIT,
        message: `A record can hold ${MAX_ATTACHMENTS_PER_ENTITY} attachments`,
        attempted: fileIds.length,
        max: MAX_ATTACHMENTS_PER_ENTITY,
      });
    }
  }
}
