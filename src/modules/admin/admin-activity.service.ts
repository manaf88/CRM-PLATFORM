import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { resolveDateRange } from '../../common/utils/dashboard-time.util';
import { PostApprovalLog } from '../approvals/entities/post-approval-log.entity';
import { PostApprovalAction } from '../approvals/enums/post-approval-action.enum';
import { Company } from '../companies/entities/company.entity';
import { LeadStatusHistory } from '../leads/entities/lead-status-history.entity';
import { TaskActivityLog } from '../tasks/entities/task-activity-log.entity';
import { TaskActivityAction } from '../tasks/enums/task-activity-action.enum';
import { ActivityFilterDto } from './dto/dashboard-filter.dto';
import { Pagination } from './admin-dashboard.service';
import { LeadLogRow, PostLogRow, TaskLogRow, utcColumn } from './raw-rows';

export type ActivityEntityType = 'POST' | 'TASK' | 'LEAD';

export type ActivityItem = {
  id: string;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  actor: { id: string; name: string } | null;
  client: { id: string; name: string };
  metadata: Record<string, unknown>;
  createdAt: string;
};

/**
 * The agency activity feed (BE-22).
 *
 * BE-20 asks for one global audit table. That needs a migration, and this
 * deployment runs with `synchronize` off and no migration runner, so a new
 * table would not exist in production. Until that lands, the feed is assembled
 * from the three logs the platform already writes — post approvals, task
 * activity and lead status history. The response shape is the one BE-22
 * specifies, so swapping the source later is not a frontend change.
 */
@Injectable()
export class AdminActivityService {
  constructor(
    @InjectRepository(PostApprovalLog)
    private readonly approvalLogsRepository: Repository<PostApprovalLog>,
    @InjectRepository(TaskActivityLog)
    private readonly taskLogsRepository: Repository<TaskActivityLog>,
    @InjectRepository(LeadStatusHistory)
    private readonly leadHistoryRepository: Repository<LeadStatusHistory>,
  ) {}

  private static readonly POST_ACTIONS: Record<PostApprovalAction, string> = {
    [PostApprovalAction.SUBMITTED_TO_CLIENT]: 'POST_SUBMITTED',
    [PostApprovalAction.APPROVED]: 'POST_APPROVED',
    [PostApprovalAction.CHANGES_REQUESTED]: 'POST_CHANGES_REQUESTED',
    [PostApprovalAction.REJECTED]: 'POST_REJECTED',
    [PostApprovalAction.PUBLISHED]: 'POST_PUBLISHED',
  };

  private static readonly TASK_ACTIONS: Record<TaskActivityAction, string> = {
    [TaskActivityAction.CREATED]: 'TASK_CREATED',
    [TaskActivityAction.UPDATED]: 'TASK_UPDATED',
    [TaskActivityAction.STATUS_CHANGED]: 'TASK_STATUS_CHANGED',
    [TaskActivityAction.COMMENTED]: 'TASK_COMMENTED',
    [TaskActivityAction.ATTACHMENT_ADDED]: 'TASK_ATTACHMENT_ADDED',
    [TaskActivityAction.ATTACHMENT_REMOVED]: 'TASK_ATTACHMENT_REMOVED',
  };

  async getActivity(filters: ActivityFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const ceiling = skip + limit;

    // A date range is only applied when the caller asked for one. The default
    // "today" of the other endpoints would make the feed look empty.
    const range =
      filters.from || filters.to
        ? resolveDateRange(filters.from, filters.to)
        : null;

    const wanted = (type: ActivityEntityType) =>
      !filters.entityType || filters.entityType === type;

    const [postRows, taskRows, leadRows] = await Promise.all([
      wanted('POST') ? this.postActivity(filters, range, ceiling) : [],
      wanted('TASK') ? this.taskActivity(filters, range, ceiling) : [],
      wanted('LEAD') ? this.leadActivity(filters, range, ceiling) : [],
    ]);

    const [postTotal, taskTotal, leadTotal] = await Promise.all([
      wanted('POST') ? this.countPosts(filters, range) : 0,
      wanted('TASK') ? this.countTasks(filters, range) : 0,
      wanted('LEAD') ? this.countLeads(filters, range) : 0,
    ]);

    const total = postTotal + taskTotal + leadTotal;

    const items = [...postRows, ...taskRows, ...leadRows]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(skip, skip + limit);

    const pagination: Pagination = {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };

    return { items, pagination };
  }

  private applyCommon<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
    actorColumn: string,
  ): SelectQueryBuilder<T> {
    if (filters.clientId) {
      qb.andWhere(`${alias}.company_id = :clientId`, {
        clientId: filters.clientId,
      });
    }

    if (filters.userId) {
      qb.andWhere(`${alias}.${actorColumn} = :userId`, {
        userId: filters.userId,
      });
    }

    if (range) {
      qb.andWhere(
        `${utcColumn(`${alias}.created_at`)} BETWEEN :start AND :end`,
        {
          start: range.start,
          end: range.end,
        },
      );
    }

    return qb;
  }

  private async postActivity(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
    take: number,
  ): Promise<ActivityItem[]> {
    const qb = this.approvalLogsRepository
      .createQueryBuilder('l')
      .leftJoin('l.user', 'actor')
      .innerJoin(Company, 'c', 'c.id = l.companyId')
      .select('l.id', 'id')
      .addSelect('l.action', 'action')
      .addSelect('l.post_id', 'entityId')
      .addSelect('l.from_status', 'fromStatus')
      .addSelect('l.to_status', 'toStatus')
      .addSelect('l.note', 'note')
      .addSelect(utcColumn('l.created_at'), 'createdAt')
      .addSelect('l.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('actor.id', 'actorId')
      .addSelect('actor.full_name', 'actorName')
      .orderBy('l.created_at', 'DESC')
      .limit(take);

    this.applyCommon(qb, 'l', filters, range, 'user_id');

    const rows = await qb.getRawMany<PostLogRow>();

    return rows.map((row) => ({
      id: row.id,
      action:
        AdminActivityService.POST_ACTIONS[row.action as PostApprovalAction] ??
        String(row.action),
      entityType: 'POST' as const,
      entityId: row.entityId,
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? '' }
        : null,
      client: { id: row.clientId, name: row.clientName ?? '' },
      metadata: {
        from: row.fromStatus,
        to: row.toStatus,
        note: row.note ?? undefined,
      },
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  private async taskActivity(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
    take: number,
  ): Promise<ActivityItem[]> {
    const qb = this.taskLogsRepository
      .createQueryBuilder('l')
      .leftJoin('l.user', 'actor')
      .innerJoin(Company, 'c', 'c.id = l.companyId')
      .select('l.id', 'id')
      .addSelect('l.action', 'action')
      .addSelect('l.task_id', 'entityId')
      .addSelect('l.metadata', 'metadata')
      .addSelect(utcColumn('l.created_at'), 'createdAt')
      .addSelect('l.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('actor.id', 'actorId')
      .addSelect('actor.full_name', 'actorName')
      .orderBy('l.created_at', 'DESC')
      .limit(take);

    this.applyCommon(qb, 'l', filters, range, 'user_id');

    const rows = await qb.getRawMany<TaskLogRow>();

    return rows.map((row) => ({
      id: row.id,
      action:
        AdminActivityService.TASK_ACTIONS[row.action as TaskActivityAction] ??
        String(row.action),
      entityType: 'TASK' as const,
      entityId: row.entityId,
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? '' }
        : null,
      client: { id: row.clientId, name: row.clientName ?? '' },
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  private async leadActivity(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
    take: number,
  ): Promise<ActivityItem[]> {
    const qb = this.leadHistoryRepository
      .createQueryBuilder('l')
      .leftJoin('l.changedBy', 'actor')
      .innerJoin(Company, 'c', 'c.id = l.companyId')
      .select('l.id', 'id')
      .addSelect('l.lead_id', 'entityId')
      .addSelect('l.from_status', 'fromStatus')
      .addSelect('l.to_status', 'toStatus')
      .addSelect('l.note', 'note')
      .addSelect(utcColumn('l.created_at'), 'createdAt')
      .addSelect('l.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('actor.id', 'actorId')
      .addSelect('actor.full_name', 'actorName')
      .orderBy('l.created_at', 'DESC')
      .limit(take);

    this.applyCommon(qb, 'l', filters, range, 'changed_by_id');

    const rows = await qb.getRawMany<LeadLogRow>();

    return rows.map((row) => ({
      id: row.id,
      action: row.fromStatus ? 'LEAD_STATUS_CHANGED' : 'LEAD_CREATED',
      entityType: 'LEAD' as const,
      entityId: row.entityId,
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? '' }
        : null,
      client: { id: row.clientId, name: row.clientName ?? '' },
      metadata: {
        from: row.fromStatus,
        to: row.toStatus,
        note: row.note ?? undefined,
      },
      createdAt: new Date(row.createdAt).toISOString(),
    }));
  }

  private countPosts(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
  ): Promise<number> {
    const qb = this.approvalLogsRepository.createQueryBuilder('l');

    return this.applyCommon(qb, 'l', filters, range, 'user_id').getCount();
  }

  private countTasks(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
  ): Promise<number> {
    const qb = this.taskLogsRepository.createQueryBuilder('l');

    return this.applyCommon(qb, 'l', filters, range, 'user_id').getCount();
  }

  private countLeads(
    filters: ActivityFilterDto,
    range: { start: Date; end: Date } | null,
  ): Promise<number> {
    const qb = this.leadHistoryRepository.createQueryBuilder('l');

    return this.applyCommon(
      qb,
      'l',
      filters,
      range,
      'changed_by_id',
    ).getCount();
  }
}
