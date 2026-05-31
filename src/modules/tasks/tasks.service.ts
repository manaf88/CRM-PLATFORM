import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { FileEntity } from '../files/entities/file.entity';
import { MembershipsService } from '../memberships/memberships.service';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AttachTaskFileDto } from './dto/attach-task-file.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksQueryDto } from './dto/find-tasks-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskActivityLog } from './entities/task-activity-log.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskComment } from './entities/task-comment.entity';
import { Task } from './entities/task.entity';
import { TaskActivityAction } from './enums/task-activity-action.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TaskType } from './enums/task-type.enum';

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
  ) {}

  async create(
    companyId: string,
    dto: CreateTaskDto,
    currentUser: RequestUser,
  ): Promise<Task> {
    await this.validateAssignedUser(companyId, dto.assignedToId);
    this.validateRelatedEntityInput(dto);

    const savedTask = await this.dataSource.transaction(async (manager) => {
      const taskRepository = manager.getRepository(Task);
      const activityRepository = manager.getRepository(TaskActivityLog);

      const task = taskRepository.create({
        companyId,
        title: dto.title.trim(),
        description: this.cleanOptionalString(dto.description),
        taskType: dto.taskType ?? TaskType.GENERAL,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        assignedToId: dto.assignedToId ?? null,
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

    return savedTask;
  }

  async findAll(companyId: string, query: FindTasksQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const qb = this.tasksRepository
      .createQueryBuilder('task')
      .where('task.companyId = :companyId', { companyId });

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
    const task = await this.tasksRepository.findOne({
      where: {
        id: taskId,
        companyId,
      },
    });

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

      const before = {
        title: task.title,
        assignedToId: task.assignedToId,
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
            priority: savedTask.priority,
            dueDate: savedTask.dueDate,
            relatedEntityType: savedTask.relatedEntityType,
            relatedEntityId: savedTask.relatedEntityId,
          },
        },
      });

      await activityRepository.save(activity);

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

    return result.savedTask;
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

      const task = await taskRepository.findOne({
        where: {
          id: taskId,
          companyId,
        },
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      if (task.status === dto.status) {
        throw new BadRequestException(
          `Task is already in status ${dto.status}`,
        );
      }

      const fromStatus = task.status;

      task.status = dto.status;
      task.updatedById = currentUser.id;

      if (dto.status === TaskStatus.DONE) {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
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

    return result;
  }

  async addComment(
    companyId: string,
    taskId: string,
    dto: CreateTaskCommentDto,
    currentUser: RequestUser,
  ): Promise<TaskComment> {
    const task = await this.findOne(companyId, taskId);

    const savedComment = await this.dataSource.transaction(
      async (manager) => {
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
      },
    );

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

      const savedAttachment =
        await attachmentRepository.save(attachment);

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

  private validateRelatedEntityInput(
    dto: CreateTaskDto | UpdateTaskDto,
  ): void {
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

    const hasMembership =
      await this.membershipsService.existsActiveMembership(
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