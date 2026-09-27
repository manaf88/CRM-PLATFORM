import { RequestUser } from '../auth/types/request-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { Task } from './entities/task.entity';
import { TaskRelatedEntityType } from './enums/task-related-entity-type.enum';
import { TaskStatus } from './enums/task-status.enum';
import { TasksService } from './tasks.service';

/**
 * The chain gate. Stage two may be worked on at any time, but it cannot be
 * handed to an approver while stage one is still open — that is the whole
 * difference between a pipeline and a list of tasks that happen to be
 * numbered.
 */
describe('TasksService stage chaining', () => {
  const COMPANY = 'company-1';
  const POST = 'post-1';

  const YASIN: RequestUser = {
    id: 'yasin',
    email: 'yasin@example.com',
    fullName: 'Yasin',
    platformRole: PlatformRole.USER,
  };

  const buildService = (
    task: Partial<Task>,
    blocking: Partial<Task>[] = [],
  ) => {
    const design = {
      id: 'design-task',
      companyId: COMPANY,
      title: 'Design the carousel',
      status: TaskStatus.IN_PROGRESS,
      assignedToId: YASIN.id,
      approverId: 'omar',
      relatedEntityType: TaskRelatedEntityType.POST,
      relatedEntityId: POST,
      sequence: 2,
      submittedForReviewAt: null,
      ...task,
    } as Task;

    const taskRepository = {
      findOne: () => Promise.resolve(design),
      find: () => Promise.resolve(blocking as Task[]),
      save: (saved: Task) => Promise.resolve(saved),
    };

    const activityRepository = {
      create: (row: unknown) => row,
      save: (row: unknown) => Promise.resolve(row),
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
      getOne: () => Promise.resolve(design),
    };

    const service = new TasksService(
      {
        createQueryBuilder: () => queryBuilder,
        find: () => Promise.resolve(blocking as Task[]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        transaction: (callback: (m: unknown) => Promise<unknown>) =>
          callback(manager),
      } as never,
      { create: () => Promise.resolve({}) } as unknown as NotificationsService,
      {} as never,
      {} as never,
    );

    return { service, design };
  };

  it('refuses to submit stage two while stage one is open', async () => {
    const { service } = buildService({}, [
      {
        id: 'copy-task',
        title: 'Write the copy',
        sequence: 1,
        status: TaskStatus.IN_PROGRESS,
      },
    ]);

    await expect(
      service.submitForReview(COMPANY, 'design-task', YASIN),
    ).rejects.toMatchObject({
      response: {
        code: 'PREVIOUS_STAGE_OPEN',
        openTaskIds: ['copy-task'],
      },
    });
  });

  it('lets stage two go once nothing earlier is open', async () => {
    const { service, design } = buildService({}, []);

    await service.submitForReview(COMPANY, 'design-task', YASIN);

    expect(design.status).toBe(TaskStatus.IN_REVIEW);
    expect(design.submittedForReviewAt).toBeInstanceOf(Date);
  });

  it('leaves unchained tasks alone', async () => {
    const { service, design } = buildService(
      { sequence: null, relatedEntityType: null, relatedEntityId: null },
      // Even with other open work on the post, a task with no stage number
      // answers to nobody.
      [{ id: 'other', title: 'Something else', sequence: 1 }],
    );

    await service.submitForReview(COMPANY, 'design-task', YASIN);

    expect(design.status).toBe(TaskStatus.IN_REVIEW);
  });

  describe('findPostStages', () => {
    const stagesFor = (tasks: Partial<Task>[]) => {
      const service = new TasksService(
        { find: () => Promise.resolve(tasks as Task[]) } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      return service.findPostStages(COMPANY, POST);
    };

    it('counts what is done and lists what is left', async () => {
      const stages = await stagesFor([
        { id: 'copy', title: 'Copy', sequence: 1, status: TaskStatus.DONE },
        {
          id: 'design',
          title: 'Design',
          sequence: 2,
          status: TaskStatus.IN_PROGRESS,
        },
      ]);

      expect(stages.total).toBe(2);
      expect(stages.done).toBe(1);
      expect(stages.open).toEqual([
        {
          taskId: 'design',
          title: 'Design',
          sequence: 2,
          status: TaskStatus.IN_PROGRESS,
        },
      ]);
    });

    it('does not let a cancelled stage hold the progress back', async () => {
      const stages = await stagesFor([
        { id: 'copy', title: 'Copy', sequence: 1, status: TaskStatus.DONE },
        {
          id: 'design',
          title: 'Design',
          sequence: 2,
          status: TaskStatus.CANCELED,
        },
      ]);

      // done + open === total, so a progress bar built from these reaches
      // the end instead of sticking at "1 of 2".
      expect(stages).toMatchObject({ total: 1, done: 1, open: [] });
    });
  });
});
