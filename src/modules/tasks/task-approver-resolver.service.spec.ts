import { MembershipsService } from '../memberships/memberships.service';
import { ResponsibilityArea } from '../responsibilities/entities/responsibility-area.entity';
import { ResponsibilityAssignment } from '../responsibilities/entities/responsibility-assignment.entity';
import { ResponsibilityType } from '../responsibilities/enums/responsibility-type.enum';
import { TaskType } from './enums/task-type.enum';
import { TaskApproverResolverService } from './task-approver-resolver.service';

/**
 * The matrix lookup is the part of the flow nobody sees fail: when it cannot
 * find the area or cannot pick between two people it answers "no approver" and
 * the task is created anyway. These tests pin down which outcome is which, so
 * a silent null always has a named reason behind it.
 */
describe('TaskApproverResolverService', () => {
  const COMPANY = 'company-1';

  type Area = Partial<ResponsibilityArea>;
  type Assignment = Partial<ResponsibilityAssignment>;

  const build = (options: {
    areaByKey?: Area | null;
    areaByName?: Area | null;
    assignments?: Assignment[];
    activeUserIds?: string[];
    areaFindOneError?: Error;
  }) => {
    const nameQueryParameters: Record<string, unknown>[] = [];

    const queryBuilder = {
      where: () => queryBuilder,
      andWhere: (_sql: string, parameters?: Record<string, unknown>) => {
        if (parameters) {
          nameQueryParameters.push(parameters);
        }

        return queryBuilder;
      },
      orderBy: () => queryBuilder,
      addOrderBy: () => queryBuilder,
      getOne: () => Promise.resolve(options.areaByName ?? null),
    };

    const areasRepository = {
      findOne: () => {
        if (options.areaFindOneError) {
          return Promise.reject(options.areaFindOneError);
        }

        return Promise.resolve(options.areaByKey ?? null);
      },
      createQueryBuilder: () => queryBuilder,
    };

    const assignmentsRepository = {
      find: () => Promise.resolve(options.assignments ?? []),
    };

    const membershipsService = {
      existsActiveMembership: (userId: string) =>
        Promise.resolve((options.activeUserIds ?? []).includes(userId)),
    };

    const service = new TaskApproverResolverService(
      areasRepository as never,
      assignmentsRepository as never,
      membershipsService as unknown as MembershipsService,
    );

    return { service, nameQueryParameters };
  };

  const approves = (memberUserId: string): Assignment => ({
    memberUserId,
    type: ResponsibilityType.TO_APPROVE,
  });

  it('does not look anywhere for a task type with no area', async () => {
    const { service } = build({});

    const resolution = await service.resolve(COMPANY, TaskType.GENERAL);

    expect(resolution.reason).toBe('UNMAPPED_TASK_TYPE');
    expect(resolution.approverId).toBeNull();
  });

  it('reports the missing area rather than throwing', async () => {
    const { service } = build({ areaByKey: null, areaByName: null });

    const resolution = await service.resolve(COMPANY, TaskType.DESIGN);

    expect(resolution.reason).toBe('NO_MATCHING_AREA');
    expect(resolution.approverId).toBeNull();
  });

  it('names the single approver held in the area', async () => {
    const { service } = build({
      areaByKey: { id: 'area-1', name: 'Design' },
      assignments: [approves('omar')],
      activeUserIds: ['omar'],
    });

    const resolution = await service.resolve(COMPANY, TaskType.DESIGN);

    expect(resolution).toMatchObject({
      approverId: 'omar',
      reason: 'RESOLVED',
      areaId: 'area-1',
      areaName: 'Design',
    });
  });

  it('refuses to pick when two people approve the same area', async () => {
    const { service } = build({
      areaByKey: { id: 'area-1', name: 'Design' },
      assignments: [approves('omar'), approves('lina')],
      activeUserIds: ['omar', 'lina'],
    });

    const resolution = await service.resolve(COMPANY, TaskType.DESIGN);

    expect(resolution.approverId).toBeNull();
    expect(resolution.reason).toBe('MULTIPLE_APPROVERS');
    expect(resolution.candidateUserIds).toEqual(['omar', 'lina']);
  });

  it('ignores an approver who has left the client', async () => {
    const { service } = build({
      areaByKey: { id: 'area-1', name: 'Design' },
      assignments: [approves('omar')],
      activeUserIds: [],
    });

    const resolution = await service.resolve(COMPANY, TaskType.DESIGN);

    expect(resolution.approverId).toBeNull();
    expect(resolution.reason).toBe('NO_APPROVER_IN_AREA');
  });

  it('falls back to known names, in Arabic too, when no area carries the key', async () => {
    const { service, nameQueryParameters } = build({
      areaByKey: null,
      areaByName: { id: 'area-9', name: 'تصميم' },
      assignments: [approves('omar')],
      activeUserIds: ['omar'],
    });

    const resolution = await service.resolve(COMPANY, TaskType.DESIGN);

    expect(resolution).toMatchObject({
      approverId: 'omar',
      reason: 'RESOLVED',
      areaId: 'area-9',
    });

    const names = nameQueryParameters.find((parameters) => 'names' in parameters)
      ?.names as string[];

    expect(names).toContain('design');
    expect(names).toContain('تصميم');
  });

  it('never fails a task creation when the lookup blows up', async () => {
    const { service } = build({
      areaFindOneError: new Error('connection reset'),
    });

    await expect(
      service.resolveApproverId(COMPANY, TaskType.DESIGN),
    ).resolves.toBeNull();
  });
});
