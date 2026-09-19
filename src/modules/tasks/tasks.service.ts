import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { FileEntity } from '../files/entities/file.entity';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { ApprovalQueueQueryDto } from './dto/approval-queue-query.dto';
import { AttachTaskFileDto } from './dto/attach-task-file.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksQueryDto } from './dto/find-tasks-query.dto';
import { RequestTaskChangesDto } from './dto/request-task-changes.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskActivityLog } from './entities/task-activity-log.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskComment } from './entities/task-comment.entity';
import { Task } from './entities/task.entity';
import { TaskActivityAction } from './enums/task-activity-action.enum';
import { TaskApprovalErrorCode } from './enums/task-approval-error-code.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TaskType } from './enums/task-type.enum';
import { TaskApproverResolverService } from './task-approver-resolver.service';

/** The three actions that own the IN_REVIEW state. */
type ReviewAction = 'submit-for-review' | 'approve' | 'request-changes';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,

    @InjectRepository(TaskComment)
    private readonly taskCommentsRepository: Repository<TaskComment>,

    @InjectRepository(TaskActivityLog)
    private readonly taskActivityLogsRepository: Repository<TaskActivityLog>,

    @InjectRepository(TaskAttachment)
    private readonly taskAttachmentsRepository: Repository<TaskAttachment>,

    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,

    private readonly membershipsService: MembershipsService,
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly approverResolver: TaskApproverResolverService,
  ) {}

  async create(
    companyId: string,
    dto: CreateTaskDto,
    currentUser: RequestUser,
  ): Promise<Task> {
    await this.validateAssignedUser(companyId, dto.assignedToId);
    await this.validateApprover(companyId, dto.approverId);
    this.validateRelatedEntityInput(dto);

    const taskType = dto.taskType ?? TaskType.GENERAL;

    // Naming an approver wins; otherwise the matrix answers "who approves this
    // kind of work for this client". Anything but a single clear answer leaves
    // the task without one, and the frontend asks for a name.
    const approverId =
      dto.approverId ??
      (await this.approverResolver.resolveApproverId(companyId, taskType));

    this.warnIfSelfApproval(approverId, dto.assignedToId ?? null);

    const savedTask = await this.dataSource.transaction(async (manager) => {
      const taskRepository = manager.getRepository(Task);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const task = taskRepository.create({
        companyId,
        title: dto.title.trim(),
        description: this.cleanOptionalString(dto.description),
        taskType,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        assignedToId: dto.assignedToId ?? null,
        approverId,
        relatedEntityType: dto.relatedEntityType ?? null,
        relatedEntityId: dto.relatedEntityId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: this.cleanOptionalString(dto.notes),
        createdById: currentUser.id,
        updatedById: currentUser.id,
      });

      const savedTask = await taskRepository.save(task);

      const activity = activityRepository.create({
        companyId,
        taskId: savedTask.id,
        userId: currentUser.id,
        action: TaskActivityAction.CREATED,
        metadata: {
          title: savedTask.title,
          assignedToId: savedTask.assignedToId,
          approverId: savedTask.approverId,
          approverResolvedFromMatrix: !dto.approverId && !!approverId,
          priority: savedTask.priority,
          taskType: savedTask.taskType,
          relatedEntityType: savedTask.relatedEntityType,
          relatedEntityId: savedTask.relatedEntityId,
        },
      });

      await activityRepository.save(activity);

      return savedTask;
    });

    await this.notifyTaskAssigned({
      task: savedTask,
      currentUser,
    });

    // Re-read so the response carries assignedTo and approver as objects, the
    // same as every other endpoint that returns a task.
    return this.findOne(companyId, savedTask.id);
  }

  async findAll(companyId: string, query: FindTasksQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.companyId = :companyId', { companyId });

    this.selectTaskPeople(qb);

    if (query.status) {
      qb.andWhere('task.status = :status', { status: query.status });
    }

    if (query.priority) {
      qb.andWhere('task.priority = :priority', {
        priority: query.priority,
      });
    }

    if (query.taskType) {
      qb.andWhere('task.taskType = :taskType', {
        taskType: query.taskType,
      });
    }

    if (query.assignedToId) {
      qb.andWhere('task.assignedToId = :assignedToId', {
        assignedToId: query.assignedToId,
      });
    }

    if (query.relatedEntityType) {
      qb.andWhere('task.relatedEntityType = :relatedEntityType', {
        relatedEntityType: query.relatedEntityType,
      });
    }

    if (query.relatedEntityId) {
      qb.andWhere('task.relatedEntityId = :relatedEntityId', {
        relatedEntityId: query.relatedEntityId,
      });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;

      qb.andWhere(
        new Brackets((innerQb) => {
          innerQb
            .where('task.title ILIKE :search', { search })
            .orWhere('task.description ILIKE :search', { search })
            .orWhere('task.notes ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('task.dueDate', 'ASC', 'NULLS LAST')
      .addOrderBy('task.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(companyId: string, taskId: string): Promise<Task> {
    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.id = :taskId', { taskId })
      .andWhere('task.companyId = :companyId', { companyId });

    this.selectTaskPeople(qb);

    const task = await qb.getOne();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(
    companyId: string,
    taskId: string,
    dto: UpdateTaskDto,
    currentUser: RequestUser,
  ): Promise<Task> {
    await this.validateAssignedUser(companyId, dto.assignedToId);
    await this.validateApprover(companyId, dto.approverId);
    this.validateRelatedEntityInput(dto);

    const result = await this.dataSource.transaction(async (manager) => {
      const taskRepository = manager.getRepository(Task);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const task = await taskRepository.findOne({
        where: {
          id: taskId,
          companyId,
        },
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const previousAssignedToId = task.assignedToId;
      const previousApproverId = task.approverId;

      const before = {
        title: task.title,
        assignedToId: task.assignedToId,
        approverId: task.approverId,
        priority: task.priority,
        dueDate: task.dueDate,
        relatedEntityType: task.relatedEntityType,
        relatedEntityId: task.relatedEntityId,
      };

      if (dto.title !== undefined) {
        task.title = dto.title.trim();
      }

      if (dto.description !== undefined) {
        task.description = this.cleanOptionalString(dto.description);
      }

      if (dto.taskType !== undefined) {
        task.taskType = dto.taskType;
      }

      if (dto.priority !== undefined) {
        task.priority = dto.priority;
      }

      if (dto.assignedToId !== undefined) {
        task.assignedToId = dto.assignedToId || null;
      }

      if (dto.approverId !== undefined) {
        task.approverId = dto.approverId || null;
      }

      if (dto.relatedEntityType !== undefined) {
        task.relatedEntityType = dto.relatedEntityType ?? null;
      }

      if (dto.relatedEntityId !== undefined) {
        task.relatedEntityId = dto.relatedEntityId ?? null;
      }

      if (dto.dueDate !== undefined) {
        task.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }

      if (dto.notes !== undefined) {
        task.notes = this.cleanOptionalString(dto.notes);
      }

      task.updatedById = currentUser.id;

      const savedTask = await taskRepository.save(task);

      const activity = activityRepository.create({
        companyId,
        taskId: savedTask.id,
        userId: currentUser.id,
        action: TaskActivityAction.UPDATED,
        metadata: {
          before,
          after: {
            title: savedTask.title,
            assignedToId: savedTask.assignedToId,
            approverId: savedTask.approverId,
            priority: savedTask.priority,
            dueDate: savedTask.dueDate,
            relatedEntityType: savedTask.relatedEntityType,
            relatedEntityId: savedTask.relatedEntityId,
          },
        },
      });

      await activityRepository.save(activity);

      // Reassigning the approver is the answer to "Omar is on holiday", so it
      // gets its own row rather than hiding inside an UPDATED blob.
      if (savedTask.approverId !== previousApproverId) {
        this.warnIfSelfApproval(savedTask.approverId, savedTask.assignedToId);

        await activityRepository.save(
          activityRepository.create({
            companyId,
            taskId: savedTask.id,
            userId: currentUser.id,
            action: TaskActivityAction.TASK_APPROVER_CHANGED,
            metadata: {
              from: previousApproverId,
              to: savedTask.approverId,
            },
          }),
        );
      }

      return {
        savedTask,
        previousAssignedToId,
      };
    });

    await this.notifyTaskAssigned({
      task: result.savedTask,
      currentUser,
      previousAssignedToId: result.previousAssignedToId,
    });

    return this.findOne(companyId, result.savedTask.id);
  }

  async updateStatus(
    companyId: string,
    taskId: string,
    dto: UpdateTaskStatusDto,
    currentUser: RequestUser,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const taskRepository = manager.getRepository(Task);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const task = await this.lockTask(manager, companyId, taskId);

      if (task.status === dto.status) {
        throw new BadRequestException(
          `Task is already in status ${dto.status}`,
        );
      }

      this.assertStatusIsNotReviewOwned(task.status, dto.status);

      const fromStatus = task.status;

      task.status = dto.status;
      task.updatedById = currentUser.id;

      if (dto.status === TaskStatus.DONE) {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }

      // Cancelling is the one way out of IN_REVIEW that is not an approval
      // decision, so the approver's clock stops without a verdict.
      if (dto.status === TaskStatus.CANCELED) {
        task.submittedForReviewAt = null;
      }

      const savedTask = await taskRepository.save(task);

      const activity = activityRepository.create({
        companyId,
        taskId: savedTask.id,
        userId: currentUser.id,
        action: TaskActivityAction.STATUS_CHANGED,
        metadata: {
          fromStatus,
          toStatus: dto.status,
          note: this.cleanOptionalString(dto.note),
        },
      });

      const savedActivity = await activityRepository.save(activity);

      return {
        task: savedTask,
        activityLog: savedActivity,
      };
    });

    await this.notifyTaskStatusChanged({
      task: result.task,
      currentUser,
    });

    return {
      task: await this.findOne(companyId, taskId),
      activityLog: result.activityLog,
    };
  }

  /**
   * The doer hands the task over. The row does not change hands: it keeps the
   * same assignee, so "who wrote this" survives the review.
   */
  async submitForReview(
    companyId: string,
    taskId: string,
    currentUser: RequestUser,
  ): Promise<Task> {
    const task = await this.dataSource.transaction(async (manager) => {
      const task = await this.lockTask(manager, companyId, taskId);

      this.assertActor(
        task.assignedToId,
        currentUser,
        'Only the person this task is assigned to can submit it for review',
      );

      if (!task.approverId) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: TaskApprovalErrorCode.APPROVER_REQUIRED,
          message:
            'This task has no approver. Set one before submitting it for review.',
        });
      }

      this.assertTransition(
        task.status,
        [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
        'submit-for-review',
      );

      const fromStatus = task.status;

      task.status = TaskStatus.IN_REVIEW;
      task.submittedForReviewAt = new Date();
      task.updatedById = currentUser.id;

      const savedTask = await manager.getRepository(Task).save(task);

      await this.writeActivity(manager, {
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.TASK_SUBMITTED_FOR_REVIEW,
        metadata: {
          fromStatus,
          toStatus: savedTask.status,
          approverId: savedTask.approverId,
        },
      });

      return savedTask;
    });

    await this.notifyTaskSubmittedForReview({ task, currentUser });

    return this.findOne(companyId, taskId);
  }

  async approve(
    companyId: string,
    taskId: string,
    currentUser: RequestUser,
  ): Promise<Task> {
    const task = await this.dataSource.transaction(async (manager) => {
      const task = await this.lockTask(manager, companyId, taskId);

      this.assertActor(
        task.approverId,
        currentUser,
        'Only the approver of this task can approve it',
      );

      this.assertTransition(task.status, [TaskStatus.IN_REVIEW], 'approve');

      const now = new Date();
      const fromStatus = task.status;

      task.status = TaskStatus.DONE;
      task.reviewedAt = now;
      // The waiting clock stops here; the dashboard only ages open reviews.
      task.submittedForReviewAt = null;
      // Same field the status endpoint maintains, so "completed today" and the
      // rest of the task metrics keep counting approvals as completions.
      task.completedAt = now;
      task.updatedById = currentUser.id;

      const savedTask = await manager.getRepository(Task).save(task);

      await this.writeActivity(manager, {
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.TASK_APPROVED,
        metadata: {
          fromStatus,
          toStatus: savedTask.status,
          approverId: savedTask.approverId,
        },
      });

      return savedTask;
    });

    await this.notifyTaskApproved({ task, currentUser });

    return this.findOne(companyId, taskId);
  }

  /**
   * Sent back one step, to the same person, with a note. Never back to the
   * start of the chain — nobody should be punished for someone else's change.
   */
  async requestChanges(
    companyId: string,
    taskId: string,
    dto: RequestTaskChangesDto,
    currentUser: RequestUser,
  ): Promise<Task> {
    const result = await this.dataSource.transaction(async (manager) => {
      const task = await this.lockTask(manager, companyId, taskId);

      this.assertActor(
        task.approverId,
        currentUser,
        'Only the approver of this task can request changes on it',
      );

      this.assertTransition(
        task.status,
        [TaskStatus.IN_REVIEW],
        'request-changes',
      );

      const note = dto.note?.trim();

      if (!note) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: TaskApprovalErrorCode.REVIEW_NOTE_REQUIRED,
          message: 'Say what needs changing: a note is required.',
        });
      }

      const fromStatus = task.status;

      task.status = TaskStatus.IN_PROGRESS;
      task.reviewedAt = new Date();
      task.reviewNote = note;
      task.submittedForReviewAt = null;
      task.updatedById = currentUser.id;

      const savedTask = await manager.getRepository(Task).save(task);

      await this.writeActivity(manager, {
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.TASK_CHANGES_REQUESTED,
        metadata: {
          fromStatus,
          toStatus: savedTask.status,
          approverId: savedTask.approverId,
          note,
        },
      });

      return { savedTask, note };
    });

    await this.notifyTaskChangesRequested({
      task: result.savedTask,
      note: result.note,
      currentUser,
    });

    return this.findOne(companyId, taskId);
  }

  /** Everything sitting on the caller, oldest submission first. */
  async findApprovalQueue(
    companyId: string,
    query: ApprovalQueueQueryDto,
    currentUser: RequestUser,
  ) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.companyId = :companyId', { companyId })
      .andWhere('task.status = :inReview', { inReview: TaskStatus.IN_REVIEW })
      .andWhere('task.approverId = :approverId', {
        approverId: currentUser.id,
      });

    this.selectTaskPeople(qb);

    qb.orderBy('task.submittedForReviewAt', 'ASC', 'NULLS LAST')
      .addOrderBy('task.createdAt', 'ASC')
      .take(limit)
      .skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  /**
   * The same lookup the create path uses, exposed so the frontend can pre-fill
   * its approver picker with the matrix's answer instead of guessing.
   */
  async resolveApprover(companyId: string, taskType: TaskType) {
    return this.approverResolver.resolve(companyId, taskType);
  }

  async addComment(
    companyId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    currentUser: RequestUser,
  ): Promise<TaskComment> {
    const task = await this.findOne(companyId, taskId);

    const savedComment = await this.dataSource.transaction(async (manager) => {
      const commentRepository = manager.getRepository(TaskComment);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const comment = commentRepository.create({
        companyId,
        taskId,
        userId: currentUser.id,
        comment: dto.comment.trim(),
      });

      const savedComment = await commentRepository.save(comment);

      const activity = activityRepository.create({
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.COMMENTED,
        metadata: {
          commentId: savedComment.id,
        },
      });

      await activityRepository.save(activity);

      return savedComment;
    });

    await this.notifyTaskCommented({
      task,
      commentId: savedComment.id,
      currentUser,
    });

    return savedComment;
  }

  async findComments(
    companyId: string,
    taskId: string,
  ): Promise<TaskComment[]> {
    await this.findOne(companyId, taskId);

    return this.taskCommentsRepository.find({
      where: {
        companyId,
        taskId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async attachFile(
    companyId: string,
    taskId: string,
    dto: AttachTaskFileDto,
    currentUser: RequestUser,
  ): Promise<TaskAttachment> {
    await this.findOne(companyId, taskId);
    await this.ensureFileExists(companyId, dto.fileId);

    return this.dataSource.transaction(async (manager) => {
      const attachmentRepository = manager.getRepository(TaskAttachment);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const attachment = attachmentRepository.create({
        companyId,
        taskId,
        fileId: dto.fileId,
      });

      const savedAttachment = await attachmentRepository.save(attachment);

      const activity = activityRepository.create({
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.ATTACHMENT_ADDED,
        metadata: {
          attachmentId: savedAttachment.id,
          fileId: dto.fileId,
        },
      });

      await activityRepository.save(activity);

      return savedAttachment;
    });
  }

  async findAttachments(
    companyId: string,
    taskId: string,
  ): Promise<TaskAttachment[]> {
    await this.findOne(companyId, taskId);

    return this.taskAttachmentsRepository.find({
      where: {
        companyId,
        taskId,
      },
      relations: {
        file: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async removeAttachment(
    companyId: string,
    taskId: string,
    attachmentId: string,
    currentUser: RequestUser,
  ): Promise<{ success: true }> {
    return this.dataSource.transaction(async (manager) => {
      const attachmentRepository = manager.getRepository(TaskAttachment);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const attachment = await attachmentRepository.findOne({
        where: {
          id: attachmentId,
          companyId,
          taskId,
        },
      });

      if (!attachment) {
        throw new NotFoundException('Task attachment not found');
      }

      await attachmentRepository.remove(attachment);

      const activity = activityRepository.create({
        companyId,
        taskId,
        userId: currentUser.id,
        action: TaskActivityAction.ATTACHMENT_REMOVED,
        metadata: {
          attachmentId,
          fileId: attachment.fileId,
        },
      });

      await activityRepository.save(activity);

      return { success: true };
    });
  }

  async findActivityLogs(
    companyId: string,
    taskId: string,
  ): Promise<TaskActivityLog[]> {
    await this.findOne(companyId, taskId);

    return this.taskActivityLogsRepository.find({
      where: {
        companyId,
        taskId,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private async notifyTaskAssigned(input: {
    task: Task;
    currentUser: RequestUser;
    previousAssignedToId?: string | null;
  }): Promise<void> {
    const { task, currentUser, previousAssignedToId } = input;

    if (!task.assignedToId) {
      return;
    }

    if (task.assignedToId === currentUser.id) {
      return;
    }

    if (
      previousAssignedToId !== undefined &&
      previousAssignedToId === task.assignedToId
    ) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.assignedToId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'New task assigned',
        message: `You have been assigned a task: ${task.title}`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          taskType: task.taskType,
          priority: task.priority,
          dueDate: task.dueDate,
          relatedEntityType: task.relatedEntityType,
          relatedEntityId: task.relatedEntityId,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_ASSIGNED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyTaskStatusChanged(input: {
    task: Task;
    currentUser: RequestUser;
  }): Promise<void> {
    const { task, currentUser } = input;

    if (!task.assignedToId) {
      return;
    }

    if (task.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.assignedToId,
        type: NotificationType.TASK_STATUS_CHANGED,
        title: 'Task status updated',
        message: `Task "${task.title}" changed to ${task.status}`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_STATUS_CHANGED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyTaskCommented(input: {
    task: Task;
    commentId: string;
    currentUser: RequestUser;
  }): Promise<void> {
    const { task, commentId, currentUser } = input;

    if (!task.assignedToId) {
      return;
    }

    if (task.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.assignedToId,
        type: NotificationType.TASK_COMMENTED,
        title: 'New comment on task',
        message: `A new comment was added to task: ${task.title}`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          commentId,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_COMMENTED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyTaskSubmittedForReview(input: {
    task: Task;
    currentUser: RequestUser;
  }): Promise<void> {
    const { task, currentUser } = input;

    if (!task.approverId || task.approverId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.approverId,
        type: NotificationType.TASK_SUBMITTED_FOR_REVIEW,
        title: 'Task waiting for your review',
        message: `${currentUser.fullName} submitted "${task.title}" for your review`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          submittedForReviewAt: task.submittedForReviewAt,
          assignedToId: task.assignedToId,
          priority: task.priority,
          dueDate: task.dueDate,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_SUBMITTED_FOR_REVIEW notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyTaskApproved(input: {
    task: Task;
    currentUser: RequestUser;
  }): Promise<void> {
    const { task, currentUser } = input;

    if (!task.assignedToId || task.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.assignedToId,
        type: NotificationType.TASK_APPROVED,
        title: 'Task approved',
        message: `${currentUser.fullName} approved "${task.title}"`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          approverId: task.approverId,
          reviewedAt: task.reviewedAt,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_APPROVED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyTaskChangesRequested(input: {
    task: Task;
    note: string;
    currentUser: RequestUser;
  }): Promise<void> {
    const { task, note, currentUser } = input;

    if (!task.assignedToId || task.assignedToId === currentUser.id) {
      return;
    }

    try {
      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: task.assignedToId,
        type: NotificationType.TASK_CHANGES_REQUESTED,
        title: 'Changes requested on your task',
        message: `${currentUser.fullName} requested changes on "${task.title}": ${note}`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          approverId: task.approverId,
          note,
          reviewedAt: task.reviewedAt,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to create TASK_CHANGES_REQUESTED notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** The two people on a task, on every response that carries a task. */
  private selectTaskPeople(qb: SelectQueryBuilder<Task>): void {
    qb.leftJoin('task.assignedTo', 'assignedTo')
      .addSelect([
        'assignedTo.id',
        'assignedTo.fullName',
        'assignedTo.email',
        'assignedTo.status',
      ])
      .leftJoin('task.approver', 'approver')
      .addSelect([
        'approver.id',
        'approver.fullName',
        'approver.email',
        'approver.status',
      ]);
  }

  /**
   * Reads the row and holds it for the rest of the transaction. Two people
   * acting on the same review at the same moment is the normal case, not the
   * exotic one: the second waits here, re-reads the status and gets a 409
   * instead of silently overwriting the first verdict.
   */
  private async lockTask(
    manager: EntityManager,
    companyId: string,
    taskId: string,
  ): Promise<Task> {
    const task = await manager.getRepository(Task).findOne({
      where: {
        id: taskId,
        companyId,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private async writeActivity(
    manager: EntityManager,
    input: {
      companyId: string;
      taskId: string;
      userId: string;
      action: TaskActivityAction;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const repository = manager.getRepository(TaskActivityLog);

    await repository.save(repository.create(input));
  }

  /**
   * Agency and super admins act for anybody — the same bypass every other
   * company-scoped action in the platform gives them. The activity log keeps
   * the actor, so "the admin approved instead of Omar" stays visible.
   */
  private isAdmin(currentUser: RequestUser): boolean {
    return (
      currentUser.platformRole === PlatformRole.SUPER_ADMIN ||
      currentUser.platformRole === PlatformRole.AGENCY_ADMIN
    );
  }

  private assertActor(
    ownerId: string | null,
    currentUser: RequestUser,
    message: string,
  ): void {
    if (this.isAdmin(currentUser) || ownerId === currentUser.id) {
      return;
    }

    throw new ForbiddenException(message);
  }

  private assertTransition(
    from: TaskStatus,
    allowed: TaskStatus[],
    action: ReviewAction,
  ): void {
    if (allowed.includes(from)) {
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: TaskApprovalErrorCode.INVALID_TRANSITION,
      message: `A task in ${from} cannot take the action ${action}`,
      from,
      action,
    });
  }

  /**
   * IN_REVIEW belongs to submit / approve / request-changes. Letting the plain
   * status endpoint move a task in or out of it would push work past an
   * approver with nothing recorded, which is the hole this whole flow closes.
   * Cancelling is the one exception — a dead task should not need a verdict.
   */
  private assertStatusIsNotReviewOwned(from: TaskStatus, to: TaskStatus): void {
    const entering = to === TaskStatus.IN_REVIEW;
    const leaving = from === TaskStatus.IN_REVIEW && to !== TaskStatus.CANCELED;

    if (!entering && !leaving) {
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: TaskApprovalErrorCode.REVIEW_ACTIONS_ONLY,
      message:
        'IN_REVIEW is managed by the review actions. Use submit-for-review, approve or request-changes.',
      from,
      to,
      actions: ['submit-for-review', 'approve', 'request-changes'],
    });
  }

  private async validateApprover(
    companyId: string,
    approverId?: string,
  ): Promise<void> {
    if (!approverId) {
      return;
    }

    const hasMembership = await this.membershipsService.existsActiveMembership(
      approverId,
      companyId,
    );

    if (!hasMembership) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: TaskApprovalErrorCode.APPROVER_REQUIRED,
        message: 'The approver must be an active member of this company',
      });
    }
  }

  /**
   * Small teams do this on purpose, so it is allowed — but it is worth being
   * able to find later when somebody asks how a task came to be approved by
   * the person who did it.
   */
  private warnIfSelfApproval(
    approverId: string | null,
    assignedToId: string | null,
  ): void {
    if (approverId && approverId === assignedToId) {
      this.logger.warn(
        `Task approver ${approverId} is also the assignee — self-approval is allowed but unreviewed`,
      );
    }
  }

  private validateRelatedEntityInput(dto: CreateTaskDto | UpdateTaskDto): void {
    if (dto.relatedEntityType && !dto.relatedEntityId) {
      throw new BadRequestException(
        'relatedEntityId is required when relatedEntityType is provided',
      );
    }

    if (dto.relatedEntityId && !dto.relatedEntityType) {
      throw new BadRequestException(
        'relatedEntityType is required when relatedEntityId is provided',
      );
    }
  }

  private async validateAssignedUser(
    companyId: string,
    assignedToId?: string,
  ): Promise<void> {
    if (!assignedToId) {
      return;
    }

    const hasMembership = await this.membershipsService.existsActiveMembership(
      assignedToId,
      companyId,
    );

    if (!hasMembership) {
      throw new BadRequestException(
        'Assigned user is not an active member of this company',
      );
    }
  }

  private async ensureFileExists(
    companyId: string,
    fileId: string,
  ): Promise<void> {
    const file = await this.filesRepository.findOne({
      where: {
        id: fileId,
        companyId,
      },
    });

    if (!file) {
      throw new NotFoundException('File not found');
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
