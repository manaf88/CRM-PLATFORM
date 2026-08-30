import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { minutesSince } from '../../common/utils/dashboard-time.util';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { CampaignStatus } from '../campaigns/enums/campaign-status.enum';
import { Company } from '../companies/entities/company.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { Lead } from '../leads/entities/lead.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskPriority } from '../tasks/enums/task-priority.enum';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import {
  AdminDashboardService,
  OPEN_LEAD_STATUSES,
  OPEN_TASK_STATUSES,
  Pagination,
} from './admin-dashboard.service';
import { PaginatedDashboardFilterDto } from './dto/dashboard-filter.dto';
import {
  AttentionCampaignRow,
  AttentionChangesRow,
  AttentionLeadRow,
  AttentionPostRow,
  AttentionTaskRow,
  utcColumn,
} from './raw-rows';

export type AttentionSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type AttentionItem = {
  type: string;
  severity: AttentionSeverity;
  client: { id: string; name: string };
  entityId: string;
  title: string;
  owner: { id: string; name: string } | null;
  dueAt: string | null;
  waitingSince: string | null;
  ageMinutes: number;
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

/**
 * How many rows each category contributes before the feed is assembled.
 * The feed is a work queue, not a report — nobody pages to row 800 — but the
 * cap is reported in the response so a truncated feed is never mistaken for a
 * complete one.
 */
const PER_TYPE_CAP = 200;

@Injectable()
export class AdminAttentionService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    private readonly dashboardService: AdminDashboardService,
    private readonly configService: ConfigService,
  ) {}

  private scope<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    clientId?: string,
  ): SelectQueryBuilder<T> {
    if (clientId) {
      qb.andWhere(`${alias}.companyId = :clientId`, { clientId });
    }

    return qb;
  }

  async getAttention(filters: PaginatedDashboardFilterDto) {
    const now = new Date();

    const [tasks, publishingDue, changesStale, approvals, leads, campaigns] =
      await Promise.all([
        this.taskItems(filters, now),
        this.publishingDueItems(filters, now),
        this.changesRequestedItems(filters, now),
        this.approvalItems(filters, now),
        this.leadItems(filters, now),
        this.campaignItems(filters, now),
      ]);

    const all = [
      ...tasks,
      ...publishingDue,
      ...changesStale,
      ...approvals,
      ...leads,
      ...campaigns,
    ].sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

      return bySeverity !== 0 ? bySeverity : b.ageMinutes - a.ageMinutes;
    });

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const pagination: Pagination = {
      page,
      limit,
      total: all.length,
      totalPages: Math.max(1, Math.ceil(all.length / limit)),
    };

    return {
      items: all.slice(skip, skip + limit),
      pagination,
      summary: {
        critical: all.filter((item) => item.severity === 'CRITICAL').length,
        warning: all.filter((item) => item.severity === 'WARNING').length,
        info: all.filter((item) => item.severity === 'INFO').length,
        perTypeCap: PER_TYPE_CAP,
      },
    };
  }

  /** Overdue, blocked, and unassigned urgent work — one pass over open tasks. */
  private async taskItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const qb = this.tasksRepository
      .createQueryBuilder('t')
      .leftJoin('t.assignedTo', 'assignee')
      .innerJoin(Company, 'c', 'c.id = t.companyId')
      .select('t.id', 'id')
      .addSelect('t.title', 'title')
      .addSelect('t.status', 'status')
      .addSelect('t.priority', 'priority')
      .addSelect('t.due_date', 'dueAt')
      .addSelect(utcColumn('t.updated_at'), 'updatedAt')
      .addSelect('t.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('assignee.id', 'ownerId')
      .addSelect('assignee.full_name', 'ownerName')
      .where('t.status IN (:...open)', { open: OPEN_TASK_STATUSES })
      .andWhere(
        '(t.dueDate < :now OR t.status = :blocked OR (t.assignedToId IS NULL AND t.priority IN (:...hot)))',
        {
          now,
          blocked: TaskStatus.BLOCKED,
          hot: [TaskPriority.URGENT, TaskPriority.HIGH],
        },
      )
      .orderBy('t.due_date', 'ASC')
      .limit(PER_TYPE_CAP);

    this.scope(qb, 't', filters.clientId);

    if (filters.employeeId) {
      qb.andWhere('t.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (filters.priority) {
      qb.andWhere('t.priority = :priorityFilter', {
        priorityFilter: filters.priority,
      });
    }

    const rows = await qb.getRawMany<AttentionTaskRow>();

    return rows.map((row) => {
      const dueAt = row.dueAt ? new Date(row.dueAt) : null;
      const overdue = Boolean(dueAt && dueAt < now);
      const unassignedHot = !row.ownerId;

      let type = 'TASK_BLOCKED';
      let severity: AttentionSeverity = 'WARNING';

      if (overdue) {
        type = 'TASK_OVERDUE';
        severity =
          minutesSince(dueAt as Date, now) > 2880 ? 'CRITICAL' : 'WARNING';
      } else if (row.status === TaskStatus.BLOCKED) {
        type = 'TASK_BLOCKED';
        severity = 'WARNING';
      } else if (unassignedHot) {
        type = 'TASK_UNASSIGNED_URGENT';
        severity =
          row.priority === TaskPriority.URGENT ? 'CRITICAL' : 'WARNING';
      }

      const reference = dueAt ?? new Date(row.updatedAt);

      return {
        type,
        severity,
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.id,
        title: row.title,
        owner: row.ownerId
          ? { id: row.ownerId, name: row.ownerName ?? '' }
          : null,
        dueAt: dueAt ? dueAt.toISOString() : null,
        waitingSince: new Date(row.updatedAt).toISOString(),
        ageMinutes: minutesSince(reference, now),
      };
    });
  }

  /** BE-06 — scheduled posts whose time has passed and nobody published them. */
  private async publishingDueItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const qb = this.postsRepository
      .createQueryBuilder('p')
      .leftJoin('p.createdBy', 'author')
      .innerJoin(Company, 'c', 'c.id = p.companyId')
      .select('p.id', 'id')
      .addSelect('p.title', 'title')
      .addSelect('p.scheduled_at', 'scheduledAt')
      .addSelect('p.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('author.id', 'ownerId')
      .addSelect('author.full_name', 'ownerName')
      .where('p.status = :scheduled', {
        scheduled: ContentPostStatus.SCHEDULED,
      })
      .andWhere('p.scheduledAt IS NOT NULL')
      .andWhere('p.scheduledAt <= :now', { now })
      .orderBy('p.scheduled_at', 'ASC')
      .limit(PER_TYPE_CAP);

    this.scope(qb, 'p', filters.clientId);

    const rows = await qb.getRawMany<AttentionPostRow>();

    return rows.map((row) => {
      const scheduledAt = new Date(row.scheduledAt);

      return {
        type: 'PUBLISHING_DUE',
        severity: 'CRITICAL' as const,
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.id,
        title: row.title,
        owner: row.ownerId
          ? { id: row.ownerId, name: row.ownerName ?? '' }
          : null,
        dueAt: scheduledAt.toISOString(),
        waitingSince: scheduledAt.toISOString(),
        ageMinutes: minutesSince(scheduledAt, now),
      };
    });
  }

  /** Posts the client sent back that nobody has picked up again. */
  private async changesRequestedItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const staleAfterHours = this.configService.get<number>(
      'dashboard.changesRequestedStaleHours',
      24,
    );
    const cutoff = new Date(now.getTime() - staleAfterHours * 3_600_000);

    const qb = this.postsRepository
      .createQueryBuilder('p')
      .leftJoin('p.createdBy', 'author')
      .innerJoin(Company, 'c', 'c.id = p.companyId')
      .select('p.id', 'id')
      .addSelect('p.title', 'title')
      .addSelect(utcColumn('p.updated_at'), 'updatedAt')
      .addSelect('p.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('author.id', 'ownerId')
      .addSelect('author.full_name', 'ownerName')
      .where('p.status = :changesRequested', {
        changesRequested: ContentPostStatus.CHANGES_REQUESTED,
      })
      .andWhere(`${utcColumn('p.updated_at')} < :cutoff`, { cutoff })
      .orderBy('p.updated_at', 'ASC')
      .limit(PER_TYPE_CAP);

    this.scope(qb, 'p', filters.clientId);

    const rows = await qb.getRawMany<AttentionChangesRow>();

    return rows.map((row) => {
      const since = new Date(row.updatedAt);
      const ageMinutes = minutesSince(since, now);

      return {
        type: 'CHANGES_REQUESTED_STALE',
        severity: ageMinutes > 4320 ? 'CRITICAL' : 'WARNING',
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.id,
        title: row.title,
        owner: row.ownerId
          ? { id: row.ownerId, name: row.ownerName ?? '' }
          : null,
        dueAt: null,
        waitingSince: since.toISOString(),
        ageMinutes,
      };
    });
  }

  /** Approvals the client has been sitting on past the configured SLA. */
  private async approvalItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const waiting = await this.dashboardService.getWaitingApprovalRows(
      filters.clientId,
    );

    return waiting
      .filter((row) => row.slaState !== 'NORMAL')
      .slice(0, PER_TYPE_CAP)
      .map((row) => ({
        type: 'APPROVAL_WAITING_TOO_LONG',
        severity: row.slaState as AttentionSeverity,
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.postId,
        title: row.title,
        owner: null,
        dueAt: null,
        waitingSince: row.waitingSince.toISOString(),
        ageMinutes: minutesSince(row.waitingSince, now),
      }));
  }

  private async leadItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const qb = this.leadsRepository
      .createQueryBuilder('l')
      .leftJoin('l.assignedTo', 'assignee')
      .innerJoin(Company, 'c', 'c.id = l.companyId')
      .select('l.id', 'id')
      .addSelect('l.name', 'title')
      .addSelect('l.next_follow_up_at', 'followUpAt')
      .addSelect('l.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('assignee.id', 'ownerId')
      .addSelect('assignee.full_name', 'ownerName')
      .where('l.status IN (:...open)', { open: OPEN_LEAD_STATUSES })
      .andWhere('l.nextFollowUpAt IS NOT NULL')
      .andWhere('l.nextFollowUpAt < :now', { now })
      .orderBy('l.next_follow_up_at', 'ASC')
      .limit(PER_TYPE_CAP);

    this.scope(qb, 'l', filters.clientId);

    if (filters.employeeId) {
      qb.andWhere('l.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const rows = await qb.getRawMany<AttentionLeadRow>();

    return rows.map((row) => {
      const followUpAt = new Date(row.followUpAt);
      const ageMinutes = minutesSince(followUpAt, now);

      return {
        type: 'LEAD_FOLLOW_UP_OVERDUE',
        severity: ageMinutes > 2880 ? 'CRITICAL' : 'WARNING',
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.id,
        title: row.title,
        owner: row.ownerId
          ? { id: row.ownerId, name: row.ownerName ?? '' }
          : null,
        dueAt: followUpAt.toISOString(),
        waitingSince: followUpAt.toISOString(),
        ageMinutes,
      };
    });
  }

  /** Active campaigns ending within two weeks that still have open work. */
  private async campaignItems(
    filters: PaginatedDashboardFilterDto,
    now: Date,
  ): Promise<AttentionItem[]> {
    const horizon = new Date(now.getTime() + 14 * 86_400_000);

    const qb = this.campaignsRepository
      .createQueryBuilder('camp')
      .innerJoin(Company, 'c', 'c.id = camp.companyId')
      .leftJoin(
        Task,
        't',
        't.campaign_id = camp.id AND t.status IN (:...open)',
        { open: OPEN_TASK_STATUSES },
      )
      .select('camp.id', 'id')
      .addSelect('camp.name', 'title')
      .addSelect('camp.end_date', 'endDate')
      .addSelect('camp.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('COUNT(t.id)', 'openTasks')
      .where('camp.status = :active', { active: CampaignStatus.ACTIVE })
      .andWhere('camp.endDate IS NOT NULL')
      .andWhere('camp.endDate BETWEEN :now AND :horizon', { now, horizon })
      .groupBy('camp.id')
      .addGroupBy('c.name')
      .having('COUNT(t.id) > 0')
      .orderBy('camp.end_date', 'ASC')
      .limit(PER_TYPE_CAP);

    this.scope(qb, 'camp', filters.clientId);

    const rows = await qb.getRawMany<AttentionCampaignRow>();

    return rows.map((row) => {
      const endDate = new Date(row.endDate);

      return {
        type: 'CAMPAIGN_ENDING_INCOMPLETE',
        severity: 'WARNING' as const,
        client: { id: row.clientId, name: row.clientName ?? '' },
        entityId: row.id,
        title: `${row.title} — ${row.openTasks} task(s) still open`,
        owner: null,
        dueAt: endDate.toISOString(),
        waitingSince: null,
        ageMinutes: Math.max(
          0,
          Math.floor((endDate.getTime() - now.getTime()) / 60_000),
        ),
      };
    });
  }
}
