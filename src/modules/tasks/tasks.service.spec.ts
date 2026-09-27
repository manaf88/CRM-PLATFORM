import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { TaskActivityLog } from './entities/task-activity-log.entity';
import { Task } from './entities/task.entity';
import { TaskActivityAction } from './enums/task-activity-action.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TasksService } from './tasks.service';

/**
 * The review state machine. IN_REVIEW is the only state in the system with an
 * owner, and these tests hold the line on both halves of that: who may move a
 * task through it, and that the plain status endpoint cannot be used to walk
 * around it.
 */
describe('TasksService review actions', () => {
  const COMPANY = 'company-1';
  const TASK = 'task-1';

  const user = (id: string, platformRole = PlatformRole.USER): RequestUser => ({
    id,
    email: `${id}@example.com`,
    fullName: id,
    platformRole,
  });

  const JESSIKA = user('jessika');
  const OMAR = user('omar');
  const ADMIN = user('admin', PlatformRole.AGENCY_ADMIN);

  const buildService = (taskOverrides: Partial<Task>) => {
    const task = {
      id: TASK,
      companyId: COMPANY,
      title: 'May carousel',
      status: TaskStatus.IN_PROGRESS,
      assignedToId: JESSIKA.id,
      approverId: OMAR.id,
      submittedForReviewAt: null,
      reviewedAt: null,
      reviewNote: null,
      completedAt: null,
      ...taskOverrides,
    } as Task;

    const savedTasks: Task[] = [];
    const activityLogs: Partial<TaskActivityLog>[] = [];
    const notifications: { recipientUserId: string; type: string }[] = [];

    const taskRepository = {
      findOne: () => Promise.resolve(task),
      save: (saved: Task) => {
        savedTasks.push(saved);

        return Promise.resolve(saved);
      },
    };

    const activityRepository = {
      create: (row: Partial<TaskActivityLog>) => row,
      save: (row: Partial<TaskActivityLog>) => {
        activityLogs.push(row);

        return Promise.resolve(row);
      },
    };

    const manager = {
      getRepository: (entity: unknown) =>
        entity === Task ? taskRepository : activityRepository,
    };

    const queryBuilder = {
      where: () => queryBuilder,
      andWhere: () => queryBuilder,
      leftJoin: () => queryBuilder,
      addSelect: () => queryBuilder,
      getOne: () => Promise.resolve(task),
    };

    const tasksRepository = {
      createQueryBuilder: () => queryBuilder,
    };

    const dataSource = {
      transaction: (callback: (manager: unknown) => Promise<unknown>) =>
        callback(manager),
    };

    const notificationsService = {
      create: (input: { recipientUserId: string; type: string }) => {
        notifications.push(input);

        return Promise.resolve(input);
      },
    };

    const service = new TasksService(
      tasksRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
      notificationsService as unknown as NotificationsService,
      {} as never,
      {} as never,
    );

    return { service, task, savedTasks, activityLogs, notifications };
  };

  describe('submit-for-review', () => {
    it('hands the task to the approver and starts the clock', async () => {
      const { service, task, activityLogs, notifications } = buildService({});

      await service.submitForReview(COMPANY, TASK, JESSIKA);

      expect(task.status).toBe(TaskStatus.IN_REVIEW);
      expect(task.submittedForReviewAt).toBeInstanceOf(Date);
      // The row never changes hands — that is what keeps "who wrote this".
      expect(task.assignedToId).toBe(JESSIKA.id);
      expect(activityLogs[0]).toMatchObject({
        action: TaskActivityAction.TASK_SUBMITTED_FOR_REVIEW,
      });
      expect(notifications).toEqual([
        expect.objectContaining({ recipientUserId: OMAR.id }),
      ]);
    });

    it('refuses to submit a task nobody is set to approve', async () => {
      const { service, task, savedTasks } = buildService({ approverId: null });

      await expect(
        service.submitForReview(COMPANY, TASK, JESSIKA),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(savedTasks).toHaveLength(0);
    });

    it('answers 409 with the refused move on a finished task', async () => {
      const { service } = buildService({ status: TaskStatus.DONE });

      await expect(
        service.submitForReview(COMPANY, TASK, JESSIKA),
      ).rejects.toMatchObject({
        response: {
          code: 'INVALID_TRANSITION',
          from: TaskStatus.DONE,
          action: 'submit-for-review',
        },
      });
    });

    it('lets only the assignee, or an admin, submit', async () => {
      const { service } = buildService({});

      await expect(
        service.submitForReview(COMPANY, TASK, OMAR),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const admin = buildService({});

      await admin.service.submitForReview(COMPANY, TASK, ADMIN);

      expect(admin.task.status).toBe(TaskStatus.IN_REVIEW);
    });
  });

  describe('approve', () => {
    it('finishes the task and tells the doer', async () => {
      const { service, task, activityLogs, notifications } = buildService({
        status: TaskStatus.IN_REVIEW,
        submittedForReviewAt: new Date('2026-09-18T10:00:00.000Z'),
      });

      await service.approve(COMPANY, TASK, OMAR);

      expect(task.status).toBe(TaskStatus.DONE);
      expect(task.reviewedAt).toBeInstanceOf(Date);
      // The same field the status endpoint keeps, so the "completed today"
      // counter still sees an approval as a completion.
      expect(task.completedAt).toBeInstanceOf(Date);
      expect(task.submittedForReviewAt).toBeNull();
      expect(activityLogs[0]).toMatchObject({
        action: TaskActivityAction.TASK_APPROVED,
      });
      expect(notifications).toEqual([
        expect.objectContaining({ recipientUserId: JESSIKA.id }),
      ]);
    });

    it('is closed to everybody but the approver and admins', async () => {
      const { service } = buildService({ status: TaskStatus.IN_REVIEW });

      await expect(
        service.approve(COMPANY, TASK, JESSIKA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cannot approve a task that is not in review', async () => {
      const { service } = buildService({ status: TaskStatus.IN_PROGRESS });

      await expect(service.approve(COMPANY, TASK, OMAR)).rejects.toMatchObject({
        response: { code: 'INVALID_TRANSITION', action: 'approve' },
      });
    });
  });

  describe('request-changes', () => {
    it('sends it back one step to the same person, with the note', async () => {
      const { service, task, notifications } = buildService({
        status: TaskStatus.IN_REVIEW,
        submittedForReviewAt: new Date('2026-09-18T10:00:00.000Z'),
      });

      await service.requestChanges(
        COMPANY,
        TASK,
        { note: '  tighten the headline  ' },
        OMAR,
      );

      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(task.assignedToId).toBe(JESSIKA.id);
      expect(task.reviewNote).toBe('tighten the headline');
      // The approval clock stops; the task is not waiting on anybody now.
      expect(task.submittedForReviewAt).toBeNull();
      expect(notifications).toEqual([
        expect.objectContaining({ recipientUserId: JESSIKA.id }),
      ]);
    });

    it('will not send work back without saying why', async () => {
      const { service, task, savedTasks } = buildService({
        status: TaskStatus.IN_REVIEW,
      });

      await expect(
        service.requestChanges(COMPANY, TASK, { note: '   ' }, OMAR),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_NOTE_REQUIRED' },
      });

      expect(task.status).toBe(TaskStatus.IN_REVIEW);
      expect(savedTasks).toHaveLength(0);
    });
  });

  describe('the plain status endpoint', () => {
    it('cannot push a task into review behind the approver', async () => {
      const { service } = buildService({ status: TaskStatus.IN_PROGRESS });

      await expect(
        service.updateStatus(
          COMPANY,
          TASK,
          { status: TaskStatus.IN_REVIEW },
          JESSIKA,
        ),
      ).rejects.toMatchObject({
        response: { code: 'REVIEW_ACTIONS_ONLY' },
      });
    });

    it('cannot finish a task that is waiting on an approver', async () => {
      const { service } = buildService({ status: TaskStatus.IN_REVIEW });

      await expect(
        service.updateStatus(
          COMPANY,
          TASK,
          { status: TaskStatus.DONE },
          JESSIKA,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('still lets a task in review be cancelled, and stops its clock', async () => {
      const { service, task } = buildService({
        status: TaskStatus.IN_REVIEW,
        submittedForReviewAt: new Date('2026-09-18T10:00:00.000Z'),
      });

      await service.updateStatus(
        COMPANY,
        TASK,
        { status: TaskStatus.CANCELED },
        JESSIKA,
      );

      expect(task.status).toBe(TaskStatus.CANCELED);
      expect(task.submittedForReviewAt).toBeNull();
    });
  });
});
