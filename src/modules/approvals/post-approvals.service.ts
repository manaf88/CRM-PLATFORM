import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AddPostCommentDto } from './dto/add-post-comment.dto';
import { PostApprovalNoteDto } from './dto/post-approval-note.dto';
import { PublishPostDto } from './dto/publish-post.dto';
import { PostApprovalLog } from './entities/post-approval-log.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostApprovalAction } from './enums/post-approval-action.enum';
import { AutomationEngineService } from '../automations/automation-engine.service';
@Injectable()
export class PostApprovalsService {
  private readonly logger = new Logger(PostApprovalsService.name);

  constructor(
    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,

    @InjectRepository(PostComment)
    private readonly commentsRepository: Repository<PostComment>,

    @InjectRepository(PostApprovalLog)
    private readonly approvalLogsRepository: Repository<PostApprovalLog>,

    private readonly notificationsService: NotificationsService,
    private readonly membershipsService: MembershipsService,
    private readonly dataSource: DataSource,
    private readonly automationEngineService: AutomationEngineService,
  ) { }

  async addComment(
    companyId: string,
    postId: string,
    dto: AddPostCommentDto,
    currentUser: RequestUser,
  ): Promise<PostComment> {
    const post = await this.findPost(companyId, postId);

    const comment = this.commentsRepository.create({
      companyId,
      postId,
      userId: currentUser.id,
      comment: dto.comment.trim(),
      isInternal: dto.isInternal ?? false,
    });

    const savedComment = await this.commentsRepository.save(comment);

    await this.notifyPostCommentAdded({
      post,
      comment: savedComment,
      currentUser,
    });

    return savedComment;
  }

  async findComments(
    companyId: string,
    postId: string,
  ): Promise<PostComment[]> {
    await this.findPost(companyId, postId);

    return this.commentsRepository.find({
      where: {
        companyId,
        postId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async submitToClient(
    companyId: string,
    postId: string,
    dto: PostApprovalNoteDto,
    currentUser: RequestUser,
  ) {
    const post = await this.findPost(companyId, postId);

    this.assertStatusIn(post.status, [
      ContentPostStatus.DRAFT,
      ContentPostStatus.IN_INTERNAL_REVIEW,
      ContentPostStatus.CHANGES_REQUESTED,
      ContentPostStatus.APPROVED,
    ]);

    const result = await this.transitionPostStatus({
      post,
      toStatus: ContentPostStatus.READY_FOR_CLIENT,
      action: PostApprovalAction.SUBMITTED_TO_CLIENT,
      note: dto.note,
      currentUser,
    });

    await this.notifyPostSubmittedToClient({
      post: result.post,
      currentUser,
    });

    return result;
  }

  async approve(
    companyId: string,
    postId: string,
    dto: PostApprovalNoteDto,
    currentUser: RequestUser,
  ) {
    const post = await this.findPost(companyId, postId);

    this.assertStatusIn(post.status, [
      ContentPostStatus.READY_FOR_CLIENT,
      ContentPostStatus.CHANGES_REQUESTED,
    ]);

    const result = await this.transitionPostStatus({
      post,
      toStatus: ContentPostStatus.APPROVED,
      action: PostApprovalAction.APPROVED,
      note: dto.note,
      currentUser,
    });

    await this.notifyPostApproved({
      post: result.post,
      currentUser,
    });

    return result;
  }

  async requestChanges(
    companyId: string,
    postId: string,
    dto: PostApprovalNoteDto,
    currentUser: RequestUser,
  ) {
    const post = await this.findPost(companyId, postId);

    this.assertStatusIn(post.status, [
      ContentPostStatus.READY_FOR_CLIENT,
      ContentPostStatus.APPROVED,
    ]);

    const result = await this.transitionPostStatus({
      post,
      toStatus: ContentPostStatus.CHANGES_REQUESTED,
      action: PostApprovalAction.CHANGES_REQUESTED,
      note: dto.note,
      currentUser,
      createComment: true,
    });

    await this.notifyPostChangesRequested({
      post: result.post,
      currentUser,
    });
    await this.automationEngineService.handlePostChangesRequested({
      companyId,
      postId: result.post.id,
      postTitle: result.post.title,
      currentUser,
    });
    return result;
  }

  async reject(
    companyId: string,
    postId: string,
    dto: PostApprovalNoteDto,
    currentUser: RequestUser,
  ) {
    const post = await this.findPost(companyId, postId);

    this.assertStatusIn(post.status, [
      ContentPostStatus.READY_FOR_CLIENT,
      ContentPostStatus.CHANGES_REQUESTED,
      ContentPostStatus.APPROVED,
    ]);

    const result = await this.transitionPostStatus({
      post,
      toStatus: ContentPostStatus.CANCELED,
      action: PostApprovalAction.REJECTED,
      note: dto.note,
      currentUser,
      createComment: true,
    });

    await this.notifyPostRejected({
      post: result.post,
      currentUser,
    });

    return result;
  }

  async publish(
    companyId: string,
    postId: string,
    dto: PublishPostDto,
    currentUser: RequestUser,
  ) {
    const post = await this.findPost(companyId, postId);

    this.assertStatusIn(post.status, [
      ContentPostStatus.APPROVED,
      ContentPostStatus.SCHEDULED,
    ]);

    post.publishedUrl = dto.publishedUrl.trim();

    const result = await this.transitionPostStatus({
      post,
      toStatus: ContentPostStatus.PUBLISHED,
      action: PostApprovalAction.PUBLISHED,
      note: dto.note,
      currentUser,
      metadata: {
        publishedUrl: dto.publishedUrl.trim(),
      },
    });

    await this.notifyPostPublished({
      post: result.post,
      currentUser,
    });

    return result;
  }

  async findApprovalLogs(
    companyId: string,
    postId: string,
  ): Promise<PostApprovalLog[]> {
    await this.findPost(companyId, postId);

    return this.approvalLogsRepository.find({
      where: {
        companyId,
        postId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private async findPost(
    companyId: string,
    postId: string,
  ): Promise<ContentPost> {
    const post = await this.postsRepository.findOne({
      where: {
        id: postId,
        companyId,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  private assertStatusIn(
    currentStatus: ContentPostStatus,
    allowedStatuses: ContentPostStatus[],
  ): void {
    if (!allowedStatuses.includes(currentStatus)) {
      throw new BadRequestException(
        `Invalid post status transition from ${currentStatus}`,
      );
    }
  }

  private async transitionPostStatus(input: {
    post: ContentPost;
    toStatus: ContentPostStatus;
    action: PostApprovalAction;
    note?: string;
    currentUser: RequestUser;
    metadata?: Record<string, unknown>;
    createComment?: boolean;
  }): Promise<{
    post: ContentPost;
    approvalLog: PostApprovalLog;
    comment: PostComment | null;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const postsRepository = manager.getRepository(ContentPost);
      const logsRepository = manager.getRepository(PostApprovalLog);
      const commentsRepository = manager.getRepository(PostComment);

      const fromStatus = input.post.status;

      input.post.status = input.toStatus;
      input.post.updatedById = input.currentUser.id;

      const savedPost = await postsRepository.save(input.post);

      const log = logsRepository.create({
        companyId: savedPost.companyId,
        postId: savedPost.id,
        userId: input.currentUser.id,
        action: input.action,
        fromStatus,
        toStatus: input.toStatus,
        note: this.cleanOptionalString(input.note),
        metadata: input.metadata ?? {},
      });

      const savedLog = await logsRepository.save(log);

      let comment: PostComment | null = null;

      if (input.createComment && input.note) {
        const createdComment = commentsRepository.create({
          companyId: savedPost.companyId,
          postId: savedPost.id,
          userId: input.currentUser.id,
          comment: input.note.trim(),
          isInternal: false,
        });

        comment = await commentsRepository.save(createdComment);
      }

      return {
        post: savedPost,
        approvalLog: savedLog,
        comment,
      };
    });
  }

  private async notifyPostSubmittedToClient(input: {
    post: ContentPost;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, currentUser } = input;

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.CLIENT_OWNER,
        CompanyMembershipRole.CLIENT_REVIEWER,
      ],
      currentUser,
      type: NotificationType.POST_SUBMITTED_TO_CLIENT,
      title: 'Post ready for review',
      message: `A post is ready for your review: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        status: post.status,
      },
      errorMessage: 'Failed to create POST_SUBMITTED_TO_CLIENT notifications',
    });
  }

  private async notifyPostApproved(input: {
    post: ContentPost;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, currentUser } = input;

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.ACCOUNT_MANAGER,
        CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
      ],
      currentUser,
      type: NotificationType.POST_APPROVED,
      title: 'Post approved',
      message: `Post approved: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        status: post.status,
      },
      errorMessage: 'Failed to create POST_APPROVED notifications',
    });
  }

  private async notifyPostChangesRequested(input: {
    post: ContentPost;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, currentUser } = input;

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.ACCOUNT_MANAGER,
        CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
        CompanyMembershipRole.COPYWRITER,
        CompanyMembershipRole.DESIGNER,
      ],
      currentUser,
      type: NotificationType.POST_CHANGES_REQUESTED,
      title: 'Changes requested',
      message: `Changes were requested for post: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        status: post.status,
      },
      errorMessage: 'Failed to create POST_CHANGES_REQUESTED notifications',
    });
  }

  private async notifyPostRejected(input: {
    post: ContentPost;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, currentUser } = input;

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.ACCOUNT_MANAGER,
        CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
      ],
      currentUser,
      type: NotificationType.POST_REJECTED,
      title: 'Post rejected',
      message: `Post rejected: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        status: post.status,
      },
      errorMessage: 'Failed to create POST_REJECTED notifications',
    });
  }

  private async notifyPostPublished(input: {
    post: ContentPost;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, currentUser } = input;

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.CLIENT_OWNER,
        CompanyMembershipRole.CLIENT_REVIEWER,
        CompanyMembershipRole.ACCOUNT_MANAGER,
        CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
      ],
      currentUser,
      type: NotificationType.POST_PUBLISHED,
      title: 'Post published',
      message: `Post published: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        status: post.status,
        publishedUrl: post.publishedUrl,
      },
      errorMessage: 'Failed to create POST_PUBLISHED notifications',
    });
  }

  private async notifyPostCommentAdded(input: {
    post: ContentPost;
    comment: PostComment;
    currentUser: RequestUser;
  }): Promise<void> {
    const { post, comment, currentUser } = input;

    if (comment.isInternal) {
      await this.notifyCompanyRoles({
        companyId: post.companyId,
        roles: [
          CompanyMembershipRole.ACCOUNT_MANAGER,
          CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
          CompanyMembershipRole.COPYWRITER,
          CompanyMembershipRole.DESIGNER,
        ],
        currentUser,
        type: NotificationType.POST_COMMENTED,
        title: 'New internal comment',
        message: `A new internal comment was added to post: ${post.title}`,
        entityType: NotificationEntityType.POST,
        entityId: post.id,
        metadata: {
          commentId: comment.id,
          isInternal: true,
        },
        errorMessage: 'Failed to create internal POST_COMMENTED notifications',
      });

      return;
    }

    await this.notifyCompanyRoles({
      companyId: post.companyId,
      roles: [
        CompanyMembershipRole.ACCOUNT_MANAGER,
        CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
        CompanyMembershipRole.CLIENT_OWNER,
        CompanyMembershipRole.CLIENT_REVIEWER,
      ],
      currentUser,
      type: NotificationType.POST_COMMENTED,
      title: 'New post comment',
      message: `A new comment was added to post: ${post.title}`,
      entityType: NotificationEntityType.POST,
      entityId: post.id,
      metadata: {
        commentId: comment.id,
        isInternal: false,
      },
      errorMessage: 'Failed to create POST_COMMENTED notifications',
    });
  }

  private async notifyCompanyRoles(input: {
    companyId: string;
    roles: CompanyMembershipRole[];
    currentUser: RequestUser;
    type: NotificationType;
    title: string;
    message: string;
    entityType: NotificationEntityType;
    entityId: string;
    metadata?: Record<string, unknown>;
    errorMessage: string;
  }): Promise<void> {
    try {
      const members = await this.membershipsService.findActiveMembersByRoles(
        input.companyId,
        input.roles,
      );

      const notifications = members
        .filter((member) => member.userId !== input.currentUser.id)
        .map((member) => ({
          companyId: input.companyId,
          recipientUserId: member.userId,
          type: input.type,
          title: input.title,
          message: input.message,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata ?? {},
        }));

      await this.notificationsService.createMany(notifications);
    } catch (error) {
      this.logger.error(
        input.errorMessage,
        error instanceof Error ? error.stack : String(error),
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