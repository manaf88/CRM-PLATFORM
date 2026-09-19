import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MembershipsService } from '../memberships/memberships.service';
import { ResponsibilityArea } from '../responsibilities/entities/responsibility-area.entity';
import { ResponsibilityAssignment } from '../responsibilities/entities/responsibility-assignment.entity';
import { ResponsibilityType } from '../responsibilities/enums/responsibility-type.enum';
import { TaskType } from './enums/task-type.enum';

/**
 * Why a resolution ended the way it did. The picker in the frontend shows a
 * different thing for each, so the reason travels with the answer instead of
 * every caller re-deriving it from `approverId === null`.
 */
export type ApproverResolutionReason =
  | 'RESOLVED'
  | 'UNMAPPED_TASK_TYPE'
  | 'NO_MATCHING_AREA'
  | 'NO_APPROVER_IN_AREA'
  | 'MULTIPLE_APPROVERS';

export type ApproverResolution = {
  taskType: TaskType;
  approverId: string | null;
  reason: ApproverResolutionReason;
  areaId: string | null;
  areaName: string | null;
  /** Everyone holding TO_APPROVE in the area, for the "pick one" case. */
  candidateUserIds: string[];
};

/**
 * How a task type finds its cell in the responsibility matrix.
 *
 * Areas are free text and created per client, so the same area is "Design" on
 * one client, "Creative" on the next and «تصميم» on the third. Matching is
 * therefore: the stable `areaKey` first, and only if no area carries a key,
 * the known names for that area. A client whose areas are named in a way
 * nobody anticipated sets the key once and stops depending on spelling.
 *
 * GENERAL is deliberately absent — a general task has no area to look in.
 */
const TASK_TYPE_AREA_MAP: Partial<
  Record<TaskType, { areaKey: string; names: string[] }>
> = {
  [TaskType.COPYWRITING]: {
    areaKey: 'COPYWRITING',
    names: [
      'copywriting',
      'copy',
      'content',
      'كتابة',
      'كتابة المحتوى',
      'المحتوى',
    ],
  },
  [TaskType.DESIGN]: {
    areaKey: 'DESIGN',
    names: ['design', 'creative', 'تصميم', 'التصميم'],
  },
  [TaskType.PUBLISHING]: {
    areaKey: 'PUBLISHING',
    names: ['publishing', 'social media', 'نشر', 'النشر', 'السوشال ميديا'],
  },
  [TaskType.REPORTING]: {
    areaKey: 'REPORTING',
    names: ['reporting', 'reports', 'تقارير', 'التقارير'],
  },
  [TaskType.CLIENT_REVIEW]: {
    areaKey: 'CLIENT_REVIEW',
    names: [
      'client review',
      'account management',
      'مراجعة العميل',
      'إدارة الحساب',
    ],
  },
  [TaskType.FOLLOW_UP]: {
    areaKey: 'FOLLOW_UP',
    names: ['follow up', 'follow-up', 'متابعة', 'المتابعة'],
  },
};

@Injectable()
export class TaskApproverResolverService {
  private readonly logger = new Logger(TaskApproverResolverService.name);

  constructor(
    @InjectRepository(ResponsibilityArea)
    private readonly areasRepository: Repository<ResponsibilityArea>,

    @InjectRepository(ResponsibilityAssignment)
    private readonly assignmentsRepository: Repository<ResponsibilityAssignment>,

    private readonly membershipsService: MembershipsService,
  ) {}

  /**
   * Who approves this kind of work for this client, according to the matrix.
   *
   * Never throws and never guesses: anything other than exactly one active
   * approver comes back as `null` with the reason, and the caller carries on
   * without an approver.
   */
  async resolve(
    companyId: string,
    taskType: TaskType,
  ): Promise<ApproverResolution> {
    const empty = {
      taskType,
      approverId: null,
      areaId: null,
      areaName: null,
      candidateUserIds: [],
    };

    const mapping = TASK_TYPE_AREA_MAP[taskType];

    if (!mapping) {
      return { ...empty, reason: 'UNMAPPED_TASK_TYPE' };
    }

    const area = await this.findArea(companyId, mapping);

    if (!area) {
      return { ...empty, reason: 'NO_MATCHING_AREA' };
    }

    const found = {
      ...empty,
      areaId: area.id,
      areaName: area.name,
    };

    const assignments = await this.assignmentsRepository.find({
      where: {
        companyId,
        areaId: area.id,
        type: ResponsibilityType.TO_APPROVE,
      },
    });

    const candidateUserIds = [
      ...new Set(assignments.map((assignment) => assignment.memberUserId)),
    ];

    // Somebody who has left the client still sits in the matrix until an admin
    // tidies it up; they must not be handed new work.
    const activeUserIds: string[] = [];

    for (const userId of candidateUserIds) {
      const isActive = await this.membershipsService.existsActiveMembership(
        userId,
        companyId,
      );

      if (isActive) {
        activeUserIds.push(userId);
      }
    }

    if (activeUserIds.length === 0) {
      return { ...found, reason: 'NO_APPROVER_IN_AREA', candidateUserIds };
    }

    if (activeUserIds.length > 1) {
      // Two people approve the same area. Picking one would be a coin toss, so
      // the task is created without an approver and the frontend asks.
      return {
        ...found,
        reason: 'MULTIPLE_APPROVERS',
        candidateUserIds: activeUserIds,
      };
    }

    return {
      ...found,
      approverId: activeUserIds[0],
      reason: 'RESOLVED',
      candidateUserIds: activeUserIds,
    };
  }

  /**
   * Resolution used at task creation: the id when there is exactly one, null
   * for every other outcome. A lookup that fails must never fail the create.
   */
  async resolveApproverId(
    companyId: string,
    taskType: TaskType,
  ): Promise<string | null> {
    try {
      const resolution = await this.resolve(companyId, taskType);

      return resolution.approverId;
    } catch (error) {
      this.logger.error(
        `Approver resolution failed for company ${companyId} / ${taskType}`,
        error instanceof Error ? error.stack : String(error),
      );

      return null;
    }
  }

  private async findArea(
    companyId: string,
    mapping: { areaKey: string; names: string[] },
  ): Promise<ResponsibilityArea | null> {
    const byKey = await this.areasRepository.findOne({
      where: {
        companyId,
        areaKey: mapping.areaKey,
        isActive: true,
      },
    });

    if (byKey) {
      return byKey;
    }

    return this.areasRepository
      .createQueryBuilder('area')
      .where('area.companyId = :companyId', { companyId })
      .andWhere('area.isActive = true')
      .andWhere('LOWER(TRIM(area.name)) IN (:...names)', {
        names: mapping.names,
      })
      .orderBy('area.sortOrder', 'ASC')
      .addOrderBy('area.createdAt', 'ASC')
      .getOne();
  }
}
