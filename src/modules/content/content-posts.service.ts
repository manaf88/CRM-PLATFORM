import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Not, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { AttachmentsService } from '../attachments/attachments.service';
import { AttachmentEntityType } from '../attachments/enums/attachment-entity-type.enum';
import { CompaniesService } from '../companies/companies.service';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { TasksService } from '../tasks/tasks.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { ContentPostStatus } from './enums/content-post-status.enum';
import { ContentPost } from './entities/content-post.entity';
import { ContentPlan } from './entities/content-plan.entity';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { FindContentPostsQueryDto } from './dto/find-content-posts-query.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';

@Injectable()
export class ContentPostsService {
  constructor(
    @InjectRepository(ContentPost)
    private readonly contentPostsRepository: Repository<ContentPost>,
    @InjectRepository(ContentPlan)
    private readonly contentPlansRepository: Repository<ContentPlan>,
    private readonly companiesService: CompaniesService,
    private readonly membershipsService: MembershipsService,
    private readonly tasksService: TasksService,
    private readonly attachmentsService: AttachmentsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Work in progress. A client sees a post once the agency has decided it is
   * ready for them — never a draft, never the agency's own review.
   */
  private static readonly INTERNAL_ONLY_STATUSES = [
    ContentPostStatus.DRAFT,
    ContentPostStatus.IN_INTERNAL_REVIEW,
  ];

  async create(
    companyId: string,
    dto: CreateContentPostDto,
    currentUser: RequestUser,
  ): Promise<ContentPost> {
    await this.companiesService.findOneById(companyId);

    if (dto.contentPlanId) {
      await this.ensureContentPlanBelongsToCompany(
        companyId,
        dto.contentPlanId,
      );
    }

    const post = this.contentPostsRepository.create({
      companyId,
      contentPlanId: dto.contentPlanId ?? null,
      title: dto.title.trim(),
      contentType: dto.contentType,
      platform: dto.platform,
      caption: this.cleanOptionalString(dto.caption),
      visualBrief: this.cleanOptionalString(dto.visualBrief),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      publishedUrl: this.cleanOptionalString(dto.publishedUrl),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.dataSource.transaction(async (manager) => {
      const savedPost = await manager.getRepository(ContentPost).save(post);

      await this.attachmentsService.attachMany(manager, {
        companyId,
        entityType: AttachmentEntityType.POST,
        entityId: savedPost.id,
        fileIds: dto.attachmentFileIds ?? [],
        uploadedById: currentUser.id,
      });

      return savedPost;
    });
  }

  async findAll(
    companyId: string,
    query: FindContentPostsQueryDto,
    currentUser?: RequestUser,
  ): Promise<ContentPost[]> {
    const where: FindOptionsWhere<ContentPost> = {
      companyId,
    };

    const clientOnly = await this.isClientOnlyMember(companyId, currentUser);

    if (query.contentPlanId) {
      where.contentPlanId = query.contentPlanId;
    }

    if (query.status) {
      if (
        clientOnly &&
        ContentPostsService.INTERNAL_ONLY_STATUSES.includes(query.status)
      ) {
        return [];
      }

      where.status = query.status;
    } else if (clientOnly) {
      where.status = Not(In(ContentPostsService.INTERNAL_ONLY_STATUSES));
    }

    if (query.platform) {
      where.platform = query.platform;
    }

    if (query.contentType) {
      where.contentType = query.contentType;
    }

    return this.contentPostsRepository.find({
      where,
      order: {
        scheduledAt: 'ASC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(
    companyId: string,
    postId: string,
    currentUser?: RequestUser,
  ): Promise<ContentPost> {
    const post = await this.contentPostsRepository.findOne({
      where: {
        id: postId,
        companyId,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // A client asking for a draft is told it does not exist rather than that
    // they may not see it — a 403 would confirm the post is there.
    if (
      ContentPostsService.INTERNAL_ONLY_STATUSES.includes(post.status) &&
      (await this.isClientOnlyMember(companyId, currentUser))
    ) {
      throw new NotFoundException('Post not found');
    }

    // The pipeline the post page draws, so it does not have to fetch and
    // filter the whole task list to find out.
    post.stages = await this.tasksService.findPostStages(companyId, post.id);

    return post;
  }

  /**
   * True when the caller works for the client rather than the agency. Platform
   * admins and anybody holding a single agency role are not, even if they also
   * hold a client role.
   */
  private async isClientOnlyMember(
    companyId: string,
    currentUser?: RequestUser,
  ): Promise<boolean> {
    if (!currentUser || currentUser.platformRole !== PlatformRole.USER) {
      return false;
    }

    const roles = await this.membershipsService.findActiveMembershipRoles(
      currentUser.id,
      companyId,
    );

    if (roles.length === 0) {
      return false;
    }

    return roles.every(
      (role) =>
        role === CompanyMembershipRole.CLIENT_OWNER ||
        role === CompanyMembershipRole.CLIENT_REVIEWER,
    );
  }

  async update(
    companyId: string,
    postId: string,
    dto: UpdateContentPostDto,
    currentUser: RequestUser,
  ): Promise<ContentPost> {
    const post = await this.findOne(companyId, postId);

    if (dto.contentPlanId !== undefined) {
      if (dto.contentPlanId) {
        await this.ensureContentPlanBelongsToCompany(
          companyId,
          dto.contentPlanId,
        );
      }

      post.contentPlanId = dto.contentPlanId ?? null;
    }

    if (dto.title !== undefined) {
      post.title = dto.title.trim();
    }

    if (dto.contentType !== undefined) {
      post.contentType = dto.contentType;
    }

    if (dto.platform !== undefined) {
      post.platform = dto.platform;
    }

    if (dto.caption !== undefined) {
      post.caption = this.cleanOptionalString(dto.caption);
    }

    if (dto.visualBrief !== undefined) {
      post.visualBrief = this.cleanOptionalString(dto.visualBrief);
    }

    if (dto.scheduledAt !== undefined) {
      post.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }

    if (dto.publishedUrl !== undefined) {
      post.publishedUrl = this.cleanOptionalString(dto.publishedUrl);
    }

    if (dto.status !== undefined) {
      post.status = dto.status;
    }

    post.updatedById = currentUser.id;

    return this.contentPostsRepository.save(post);
  }

  private async ensureContentPlanBelongsToCompany(
    companyId: string,
    contentPlanId: string,
  ): Promise<void> {
    const contentPlan = await this.contentPlansRepository.findOne({
      where: {
        id: contentPlanId,
        companyId,
      },
    });

    if (!contentPlan) {
      throw new BadRequestException(
        'Content plan does not belong to this company',
      );
    }
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}
