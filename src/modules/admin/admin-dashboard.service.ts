import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';

import {
  currentMonth,
  hoursSince,
  monthRange,
  resolveDateRange,
} from '../../common/utils/dashboard-time.util';
import { AutomationRule } from '../automations/entities/automation-rule.entity';
import { AutomationRun } from '../automations/entities/automation-run.entity';
import { AutomationRunStatus } from '../automations/enums/automation-run-status.enum';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { CampaignStatus } from '../campaigns/enums/campaign-status.enum';
import { Company } from '../companies/entities/company.entity';
import { CompanyStatus } from '../companies/enums/company-status.enum';
import { ContentPlan } from '../content/entities/content-plan.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { PostApprovalLog } from '../approvals/entities/post-approval-log.entity';
import { PostApprovalAction } from '../approvals/enums/post-approval-action.enum';
import { CompanyMembership } from '../memberships/entities/company-membership.entity';
import { CompanyMembershipStatus } from '../memberships/enums/company-membership-status.enum';
import { Lead } from '../leads/entities/lead.entity';
import { LeadStatus } from '../leads/enums/lead-status.enum';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import { TaskPriority } from '../tasks/enums/task-priority.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import {
  ActiveCampaignRow,
  ApprovalTodayRow,
  AutomationRulesRow,
  AutomationRunsRow,
  CampaignLeadRow,
  CampaignPostRow,
  CampaignTaskRow,
  ClientCampaignRow,
  ClientCountRow,
  ClientLeadRow,
  ClientPlanRow,
  ClientPostRow,
  ClientTaskRow,
  ContentExtrasRow,
  ContentPlanRow,
  CountRow,
  FailedRunRow,
  LeadExtrasRow,
  MembershipCountRow,
  OverdueLeadRow,
  OverviewLeadRow,
  OverviewPostRow,
  OverviewTaskRow,
  StatusCountRow,
  TaskMetricsRow,
  WaitingApprovalRawRow,
  WorkloadTaskRow,
  utcColumn,
} from './raw-rows';
import {
  ContentPlanFilterDto,
  DashboardFilterDto,
  PaginatedDashboardFilterDto,
} from './dto/dashboard-filter.dto';

/** Task states that still represent outstanding work. */
export const OPEN_TASK_STATUSES = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.BLOCKED,
];

/** Lead states that are still in play — a follow-up on these can be overdue. */
export const OPEN_LEAD_STATUSES = [
  LeadStatus.NEW,
  LeadStatus.CONTACTED,
  LeadStatus.INTERESTED,
  LeadStatus.WAITING_DECISION,
  LeadStatus.FOLLOW_UP_LATER,
];

export type SlaState = 'NORMAL' | 'WARNING' | 'CRITICAL';

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type WaitingApprovalRow = {
  postId: string;
  title: string;
  clientId: string;
  clientName: string;
  status: ContentPostStatus;
  waitingSince: Date;
  waitingHours: number;
  slaState: SlaState;
};

/** Postgres returns bigint counts as strings. */
const num = (value: unknown): number => Number(value ?? 0) || 0;

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepository: Repository<CompanyMembership>,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,
    @InjectRepository(ContentPlan)
    private readonly contentPlansRepository: Repository<ContentPlan>,
    @InjectRepository(PostApprovalLog)
    private readonly approvalLogsRepository: Repository<PostApprovalLog>,
    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    @InjectRepository(AutomationRule)
    private readonly automationRulesRepository: Repository<AutomationRule>,
    @InjectRepository(AutomationRun)
    private readonly automationRunsRepository: Repository<AutomationRun>,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private get slaThresholds(): { warning: number; critical: number } {
    return {
      warning: this.configService.get<number>(
        'dashboard.approvalWarningHours',
        24,
      ),
      critical: this.configService.get<number>(
        'dashboard.approvalCriticalHours',
        48,
      ),
    };
  }

  private slaState(waitingHours: number): SlaState {
    const { warning, critical } = this.slaThresholds;

    if (waitingHours >= critical) {
      return 'CRITICAL';
    }

    if (waitingHours >= warning) {
      return 'WARNING';
    }

    return 'NORMAL';
  }

  /**
   * Restrict a query to one client when `clientId` is given. Both admin roles
   * see every client by default — this filter is a convenience, never a
   * permission boundary (that is enforced by the guard on the controller).
   */
  private scopeToClient<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    clientId?: string,
  ): SelectQueryBuilder<T> {
    if (clientId) {
      qb.andWhere(`${alias}.companyId = :clientId`, { clientId });
    }

    return qb;
  }

  private paginate(
    filters: PaginatedDashboardFilterDto,
    total: number,
  ): Pagination & { skip: number } {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      skip: (page - 1) * limit,
    };
  }

  // --------------------------------------------------------------- overview

  async getOverview(filters: DashboardFilterDto) {
    const now = new Date();
    const { start, end } = resolveDateRange(filters.from, filters.to);

    const clientsQb = this.companiesRepository
      .createQueryBuilder('c')
      .select('COUNT(*)', 'count')
      .where('c.status = :active', { active: CompanyStatus.ACTIVE });

    if (filters.clientId) {
      clientsQb.andWhere('c.id = :clientId', { clientId: filters.clientId });
    }

    const employeesQb = this.usersRepository
      .createQueryBuilder('u')
      .select('COUNT(*)', 'count')
      .where('u.status = :active', { active: UserStatus.ACTIVE });

    if (filters.employeeId) {
      employeesQb.andWhere('u.id = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const tasksQb = this.tasksRepository
      .createQueryBuilder('t')
      .select(
        'COUNT(*) FILTER (WHERE t.dueDate BETWEEN :start AND :end)',
        'dueToday',
      )
      .addSelect('COUNT(*) FILTER (WHERE t.dueDate < :now)', 'overdue')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :blocked)', 'blocked')
      .where('t.status IN (:...open)', { open: OPEN_TASK_STATUSES })
      .setParameters({ start, end, now, blocked: TaskStatus.BLOCKED });

    this.scopeToClient(tasksQb, 't', filters.clientId);

    if (filters.employeeId) {
      tasksQb.andWhere('t.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const postsQb = this.postsRepository
      .createQueryBuilder('p')
      .select('COUNT(*) FILTER (WHERE p.status = :readyForClient)', 'waiting')
      .setParameters({ readyForClient: ContentPostStatus.READY_FOR_CLIENT });

    this.scopeToClient(postsQb, 'p', filters.clientId);

    if (filters.employeeId) {
      postsQb.andWhere('p.createdById = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const publishedQb = this.approvalLogsRepository
      .createQueryBuilder('l')
      .select('COUNT(*)', 'count')
      .where('l.action = :published', {
        published: PostApprovalAction.PUBLISHED,
      })
      .andWhere(`${utcColumn('l.created_at')} BETWEEN :start AND :end`, {
        start,
        end,
      });

    this.scopeToClient(publishedQb, 'l', filters.clientId);

    const leadsQb = this.leadsRepository
      .createQueryBuilder('l')
      .select(
        'COUNT(*) FILTER (WHERE l.nextFollowUpAt BETWEEN :start AND :end)',
        'followUpsToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE l.nextFollowUpAt < :now)',
        'overdueFollowUps',
      )
      .where('l.status IN (:...open)', { open: OPEN_LEAD_STATUSES })
      .setParameters({ start, end, now });

    this.scopeToClient(leadsQb, 'l', filters.clientId);

    if (filters.employeeId) {
      leadsQb.andWhere('l.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const [clients, employees, tasks, posts, published, leads] =
      await Promise.all([
        clientsQb.getRawOne<CountRow>(),
        employeesQb.getRawOne<CountRow>(),
        tasksQb.getRawOne<OverviewTaskRow>(),
        postsQb.getRawOne<OverviewPostRow>(),
        publishedQb.getRawOne<CountRow>(),
        leadsQb.getRawOne<OverviewLeadRow>(),
      ]);

    return {
      activeClients: num(clients?.count),
      activeEmployees: num(employees?.count),
      dueToday: num(tasks?.dueToday),
      overdue: num(tasks?.overdue),
      blockedTasks: num(tasks?.blocked),
      waitingClientApproval: num(posts?.waiting),
      leadFollowUpsToday: num(leads?.followUpsToday),
      overdueLeadFollowUps: num(leads?.overdueFollowUps),
      publishedToday: num(published?.count),
      range: { from: start.toISOString(), to: end.toISOString() },
    };
  }

  // ------------------------------------------------------------------ tasks

  async getTasks(filters: DashboardFilterDto) {
    const now = new Date();
    const { start, end } = resolveDateRange(filters.from, filters.to);

    const qb = this.tasksRepository
      .createQueryBuilder('t')
      .select('COUNT(*) FILTER (WHERE t.status IN (:...open))', 'openTotal')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :todo)', 'todo')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :inProgress)', 'inProgress')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :inReview)', 'inReview')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :blocked)', 'blocked')
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate BETWEEN :start AND :end)',
        'dueToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate < :now)',
        'overdue',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.priority = :urgent)',
        'urgent',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.priority = :high)',
        'highPriority',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.assignedToId IS NULL)',
        'unassigned',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status = :done AND t.completedAt BETWEEN :start AND :end)',
        'completedToday',
      )
      .setParameters({
        open: OPEN_TASK_STATUSES,
        todo: TaskStatus.TODO,
        inProgress: TaskStatus.IN_PROGRESS,
        inReview: TaskStatus.IN_REVIEW,
        blocked: TaskStatus.BLOCKED,
        done: TaskStatus.DONE,
        urgent: TaskPriority.URGENT,
        high: TaskPriority.HIGH,
        start,
        end,
        now,
      });

    this.scopeToClient(qb, 't', filters.clientId);

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

    if (filters.status && filters.status in TaskStatus) {
      qb.andWhere('t.status = :statusFilter', { statusFilter: filters.status });
    }

    const row = await qb.getRawOne<TaskMetricsRow>();

    return {
      openTotal: num(row?.openTotal),
      byStatus: {
        TODO: num(row?.todo),
        IN_PROGRESS: num(row?.inProgress),
        IN_REVIEW: num(row?.inReview),
        BLOCKED: num(row?.blocked),
      },
      dueToday: num(row?.dueToday),
      overdue: num(row?.overdue),
      urgent: num(row?.urgent),
      highPriority: num(row?.highPriority),
      unassigned: num(row?.unassigned),
      completedToday: num(row?.completedToday),
    };
  }

  // ---------------------------------------------------------- team workload

  async getTeamWorkload(filters: PaginatedDashboardFilterDto) {
    const now = new Date();
    const { start, end } = resolveDateRange(filters.from, filters.to);

    const usersQb = this.usersRepository
      .createQueryBuilder('u')
      .where('u.status = :active', { active: UserStatus.ACTIVE });

    if (filters.employeeId) {
      usersQb.andWhere('u.id = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const total = await usersQb.getCount();
    const pagination = this.paginate(filters, total);

    const users = await usersQb
      .orderBy('u.fullName', 'ASC')
      .skip(pagination.skip)
      .take(pagination.limit)
      .getMany();

    if (users.length === 0) {
      return { items: [], pagination: this.stripSkip(pagination) };
    }

    const userIds = users.map((user) => user.id);

    const taskQb = this.tasksRepository
      .createQueryBuilder('t')
      .select('t.assignedToId', 'userId')
      .addSelect('COUNT(*) FILTER (WHERE t.status IN (:...open))', 'openTasks')
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate BETWEEN :start AND :end)',
        'dueToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate < :now)',
        'overdue',
      )
      .addSelect('COUNT(*) FILTER (WHERE t.status = :blocked)', 'blocked')
      .addSelect('COUNT(*) FILTER (WHERE t.status = :inReview)', 'inReview')
      .addSelect(
        'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.priority IN (:...hot))',
        'urgent',
      )
      .addSelect(
        'COUNT(DISTINCT t.companyId) FILTER (WHERE t.status IN (:...open))',
        'activeClients',
      )
      .where('t.assignedToId IN (:...userIds)', { userIds })
      .groupBy('t.assignedToId')
      .setParameters({
        open: OPEN_TASK_STATUSES,
        blocked: TaskStatus.BLOCKED,
        inReview: TaskStatus.IN_REVIEW,
        hot: [TaskPriority.URGENT, TaskPriority.HIGH],
        start,
        end,
        now,
      });

    this.scopeToClient(taskQb, 't', filters.clientId);

    const membershipQb = this.membershipsRepository
      .createQueryBuilder('m')
      .select('m.userId', 'userId')
      .addSelect('COUNT(DISTINCT m.companyId)', 'clients')
      .where('m.userId IN (:...userIds)', { userIds })
      .andWhere('m.status = :active', {
        active: CompanyMembershipStatus.ACTIVE,
      })
      .groupBy('m.userId');

    this.scopeToClient(membershipQb, 'm', filters.clientId);

    const [taskRows, membershipRows] = await Promise.all([
      taskQb.getRawMany<WorkloadTaskRow>(),
      membershipQb.getRawMany<MembershipCountRow>(),
    ]);

    const tasksByUser = new Map(taskRows.map((row) => [row.userId, row]));
    const clientsByUser = new Map(
      membershipRows.map((row) => [row.userId, num(row.clients)]),
    );

    const items = users.map((user) => {
      const row = tasksByUser.get(user.id);

      return {
        employeeId: user.id,
        name: user.fullName,
        platformRole: user.platformRole,
        clients: clientsByUser.get(user.id) ?? 0,
        openTasks: num(row?.openTasks),
        dueToday: num(row?.dueToday),
        overdue: num(row?.overdue),
        blocked: num(row?.blocked),
        inReview: num(row?.inReview),
        urgent: num(row?.urgent),
      };
    });

    return { items, pagination: this.stripSkip(pagination) };
  }

  // ---------------------------------------------------------------- content

  async getContent(filters: DashboardFilterDto) {
    const now = new Date();
    const { start, end } = resolveDateRange(filters.from, filters.to);

    const qb = this.postsRepository
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status');

    this.scopeToClient(qb, 'p', filters.clientId);

    if (filters.employeeId) {
      qb.andWhere('p.createdById = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const extrasQb = this.postsRepository
      .createQueryBuilder('p')
      .select(
        'COUNT(*) FILTER (WHERE p.scheduledAt BETWEEN :start AND :end)',
        'scheduledToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE p.status = :scheduled AND p.scheduledAt <= :now)',
        'publishingDue',
      )
      .setParameters({
        scheduled: ContentPostStatus.SCHEDULED,
        start,
        end,
        now,
      });

    this.scopeToClient(extrasQb, 'p', filters.clientId);

    const publishedQb = this.approvalLogsRepository
      .createQueryBuilder('l')
      .select('COUNT(*)', 'count')
      .where('l.action = :published', {
        published: PostApprovalAction.PUBLISHED,
      })
      .andWhere(`${utcColumn('l.created_at')} BETWEEN :start AND :end`, {
        start,
        end,
      });

    this.scopeToClient(publishedQb, 'l', filters.clientId);

    const [statusRows, extras, published, waiting] = await Promise.all([
      qb.getRawMany<StatusCountRow>(),
      extrasQb.getRawOne<ContentExtrasRow>(),
      publishedQb.getRawOne<CountRow>(),
      this.getWaitingApprovalRows(filters.clientId),
    ]);

    const byStatus = Object.values(ContentPostStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<ContentPostStatus, number>,
    );

    for (const row of statusRows) {
      byStatus[row.status as ContentPostStatus] = num(row.count);
    }

    const averageApprovalWaitHours = waiting.length
      ? Number(
          (
            waiting.reduce((sum, row) => sum + row.waitingHours, 0) /
            waiting.length
          ).toFixed(1),
        )
      : 0;

    return {
      byStatus,
      publishedToday: num(published?.count),
      scheduledToday: num(extras?.scheduledToday),
      awaitingClientAction:
        byStatus[ContentPostStatus.READY_FOR_CLIENT] +
        byStatus[ContentPostStatus.CHANGES_REQUESTED],
      changesRequested: byStatus[ContentPostStatus.CHANGES_REQUESTED],
      publishingDue: num(extras?.publishingDue),
      averageApprovalWaitHours,
    };
  }

  /**
   * Posts sitting with the client, with how long they have been there (BE-08).
   *
   * "Waiting since" is the last time the post was submitted to the client,
   * taken from the approval log. Posts that predate the log fall back to their
   * own updatedAt, which is the best available signal.
   */
  async getWaitingApprovalRows(
    clientId?: string,
  ): Promise<WaitingApprovalRow[]> {
    const qb = this.postsRepository
      .createQueryBuilder('p')
      .innerJoin(Company, 'c', 'c.id = p.companyId')
      .leftJoin(
        PostApprovalLog,
        'l',
        'l.postId = p.id AND l.action = :submitted',
        { submitted: PostApprovalAction.SUBMITTED_TO_CLIENT },
      )
      .select('p.id', 'postId')
      .addSelect('p.title', 'title')
      .addSelect('p.status', 'status')
      .addSelect('p.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect(
        `COALESCE(MAX(${utcColumn('l.created_at')}), ${utcColumn('p.updated_at')})`,
        'waitingSince',
      )
      .where('p.status = :readyForClient', {
        readyForClient: ContentPostStatus.READY_FOR_CLIENT,
      })
      .groupBy('p.id')
      .addGroupBy('c.name');

    this.scopeToClient(qb, 'p', clientId);

    const rows = await qb.getRawMany<WaitingApprovalRawRow>();
    const now = new Date();

    return rows
      .map((row) => {
        const waitingSince = new Date(row.waitingSince);
        const waitingHours = hoursSince(waitingSince, now);

        return {
          postId: row.postId,
          title: row.title,
          clientId: row.clientId,
          clientName: row.clientName,
          status: row.status as ContentPostStatus,
          waitingSince,
          waitingHours,
          slaState: this.slaState(waitingHours),
        };
      })
      .sort((a, b) => b.waitingHours - a.waitingHours);
  }

  // -------------------------------------------------------------- approvals

  async getApprovals(filters: DashboardFilterDto) {
    const { start, end } = resolveDateRange(filters.from, filters.to);
    const { critical } = this.slaThresholds;

    const waiting = await this.getWaitingApprovalRows(filters.clientId);

    const todayQb = this.approvalLogsRepository
      .createQueryBuilder('l')
      .select('COUNT(*) FILTER (WHERE l.action = :approved)', 'approvedToday')
      .addSelect(
        'COUNT(*) FILTER (WHERE l.action IN (:...rejected))',
        'rejectedToday',
      )
      .where(`${utcColumn('l.created_at')} BETWEEN :start AND :end`)
      .setParameters({
        approved: PostApprovalAction.APPROVED,
        rejected: [PostApprovalAction.REJECTED],
        start,
        end,
      });

    this.scopeToClient(todayQb, 'l', filters.clientId);

    const changesQb = this.postsRepository
      .createQueryBuilder('p')
      .select('p.company_id', 'clientId')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :changesRequested', {
        changesRequested: ContentPostStatus.CHANGES_REQUESTED,
      })
      .groupBy('p.company_id');

    this.scopeToClient(changesQb, 'p', filters.clientId);

    const [today, changesRows] = await Promise.all([
      todayQb.getRawOne<ApprovalTodayRow>(),
      changesQb.getRawMany<ClientCountRow>(),
    ]);

    const changesByClient = new Map(
      changesRows.map((row) => [row.clientId, num(row.count)]),
    );

    const byClient = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        waiting: number;
        oldestWaitingHours: number;
        changesRequested: number;
        slaState: SlaState;
      }
    >();

    for (const row of waiting) {
      const existing = byClient.get(row.clientId);

      if (existing) {
        existing.waiting += 1;
        existing.oldestWaitingHours = Math.max(
          existing.oldestWaitingHours,
          row.waitingHours,
        );
        existing.slaState = this.slaState(existing.oldestWaitingHours);
        continue;
      }

      byClient.set(row.clientId, {
        clientId: row.clientId,
        clientName: row.clientName,
        waiting: 1,
        oldestWaitingHours: row.waitingHours,
        changesRequested: changesByClient.get(row.clientId) ?? 0,
        slaState: row.slaState,
      });
    }

    // Clients with changes requested but nothing waiting still belong in the list.
    for (const [clientId, count] of changesByClient) {
      if (!byClient.has(clientId)) {
        byClient.set(clientId, {
          clientId,
          clientName: '',
          waiting: 0,
          oldestWaitingHours: 0,
          changesRequested: count,
          slaState: 'NORMAL',
        });
      }
    }

    const unnamed = [...byClient.values()].filter((row) => !row.clientName);

    if (unnamed.length) {
      const companies = await this.companiesRepository.findBy({
        id: In(unnamed.map((row) => row.clientId)),
      });

      for (const company of companies) {
        const row = byClient.get(company.id);

        if (row) {
          row.clientName = company.name;
        }
      }
    }

    const oldest = waiting[0];

    return {
      waiting: waiting.length,
      overThreshold: waiting.filter((row) => row.waitingHours >= critical)
        .length,
      averageWaitHours: waiting.length
        ? Number(
            (
              waiting.reduce((sum, row) => sum + row.waitingHours, 0) /
              waiting.length
            ).toFixed(1),
          )
        : 0,
      approvedToday: num(today?.approvedToday),
      rejectedToday: num(today?.rejectedToday),
      changesRequested: [...changesByClient.values()].reduce(
        (sum, count) => sum + count,
        0,
      ),
      oldestWaiting: oldest
        ? {
            postId: oldest.postId,
            title: oldest.title,
            clientId: oldest.clientId,
            clientName: oldest.clientName,
            waitingHours: oldest.waitingHours,
            waitingSince: oldest.waitingSince.toISOString(),
            slaState: oldest.slaState,
          }
        : null,
      thresholds: this.slaThresholds,
      clients: [...byClient.values()].sort(
        (a, b) => b.oldestWaitingHours - a.oldestWaitingHours,
      ),
    };
  }

  // ------------------------------------------------------------------ leads

  async getLeads(filters: DashboardFilterDto) {
    const now = new Date();
    const { start, end } = resolveDateRange(filters.from, filters.to);
    const { month, year } = currentMonth(now);
    const thisMonth = monthRange(year, month);

    const statusQb = this.leadsRepository
      .createQueryBuilder('l')
      .select('l.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('l.status');

    this.scopeToClient(statusQb, 'l', filters.clientId);

    if (filters.employeeId) {
      statusQb.andWhere('l.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const extrasQb = this.leadsRepository
      .createQueryBuilder('l')
      .select(
        `COUNT(*) FILTER (WHERE ${utcColumn('l.created_at')} BETWEEN :start AND :end)`,
        'newToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE l.status IN (:...open) AND l.nextFollowUpAt BETWEEN :start AND :end)',
        'followUpsToday',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE l.status IN (:...open) AND l.nextFollowUpAt < :now)',
        'overdueFollowUps',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE l.status = :won AND ${utcColumn('l.updated_at')} BETWEEN :monthStart AND :monthEnd)`,
        'wonThisMonth',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE l.status = :lost AND ${utcColumn('l.updated_at')} BETWEEN :monthStart AND :monthEnd)`,
        'lostThisMonth',
      )
      .setParameters({
        open: OPEN_LEAD_STATUSES,
        won: LeadStatus.WON,
        lost: LeadStatus.LOST,
        start,
        end,
        now,
        monthStart: thisMonth.start,
        monthEnd: thisMonth.end,
      });

    this.scopeToClient(extrasQb, 'l', filters.clientId);

    if (filters.employeeId) {
      extrasQb.andWhere('l.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const [statusRows, extras] = await Promise.all([
      statusQb.getRawMany<StatusCountRow>(),
      extrasQb.getRawOne<LeadExtrasRow>(),
    ]);

    const byStatus = Object.values(LeadStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<LeadStatus, number>,
    );

    for (const row of statusRows) {
      byStatus[row.status as LeadStatus] = num(row.count);
    }

    const closed = byStatus[LeadStatus.WON] + byStatus[LeadStatus.LOST];

    return {
      byStatus,
      newToday: num(extras?.newToday),
      followUpsToday: num(extras?.followUpsToday),
      overdueFollowUps: num(extras?.overdueFollowUps),
      wonThisMonth: num(extras?.wonThisMonth),
      lostThisMonth: num(extras?.lostThisMonth),
      conversionRate: closed
        ? Number((byStatus[LeadStatus.WON] / closed).toFixed(4))
        : 0,
    };
  }

  /** BE-12 — the drill-down behind "overdue follow-ups". */
  async getOverdueLeadFollowUps(filters: PaginatedDashboardFilterDto) {
    const now = new Date();

    const qb = this.leadsRepository
      .createQueryBuilder('l')
      .leftJoin('l.assignedTo', 'assignee')
      .innerJoin(Company, 'c', 'c.id = l.companyId')
      .select('l.id', 'leadId')
      .addSelect('l.name', 'leadName')
      .addSelect('l.status', 'status')
      .addSelect('l.next_follow_up_at', 'followUpDate')
      .addSelect('l.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('assignee.id', 'assigneeId')
      .addSelect('assignee.full_name', 'assigneeName')
      .where('l.status IN (:...open)', { open: OPEN_LEAD_STATUSES })
      .andWhere('l.nextFollowUpAt IS NOT NULL')
      .andWhere('l.nextFollowUpAt < :now', { now })
      .orderBy('l.next_follow_up_at', 'ASC');

    this.scopeToClient(qb, 'l', filters.clientId);

    if (filters.employeeId) {
      qb.andWhere('l.assignedToId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    const total = await qb.getCount();
    const pagination = this.paginate(filters, total);

    const rows = await qb
      .offset(pagination.skip)
      .limit(pagination.limit)
      .getRawMany<OverdueLeadRow>();

    const items = rows.map((row) => {
      const followUpDate = new Date(row.followUpDate);
      const overdueHours = hoursSince(followUpDate, now);

      return {
        leadId: row.leadId,
        leadName: row.leadName,
        status: row.status,
        client: { id: row.clientId, name: row.clientName ?? '' },
        assignedTo: row.assigneeId
          ? { id: row.assigneeId, name: row.assigneeName ?? '' }
          : null,
        followUpDate: followUpDate.toISOString(),
        overdueHours,
        overdueDays: Math.floor(overdueHours / 24),
      };
    });

    return { items, pagination: this.stripSkip(pagination) };
  }

  // -------------------------------------------------------------- campaigns

  async getCampaigns(filters: DashboardFilterDto) {
    const now = new Date();
    const endingSoonCutoff = new Date(now.getTime() + 14 * 86_400_000);

    const countsQb = this.campaignsRepository
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.status');

    this.scopeToClient(countsQb, 'c', filters.clientId);

    const activeQb = this.campaignsRepository
      .createQueryBuilder('c')
      .innerJoin(Company, 'client', 'client.id = c.companyId')
      .select('c.id', 'campaignId')
      .addSelect('c.name', 'name')
      .addSelect('c.objective', 'objective')
      .addSelect('c.start_date', 'startDate')
      .addSelect('c.end_date', 'endDate')
      .addSelect('c.company_id', 'clientId')
      .addSelect('client.name', 'clientName')
      .where('c.status = :active', { active: CampaignStatus.ACTIVE })
      .orderBy('c.end_date', 'ASC');

    this.scopeToClient(activeQb, 'c', filters.clientId);

    const [countRows, activeRows] = await Promise.all([
      countsQb.getRawMany<StatusCountRow>(),
      activeQb.getRawMany<ActiveCampaignRow>(),
    ]);

    const counts = Object.values(CampaignStatus).reduce(
      (acc, status) => ({ ...acc, [status.toLowerCase()]: 0 }),
      {} as Record<string, number>,
    );

    for (const row of countRows) {
      counts[String(row.status).toLowerCase()] = num(row.count);
    }

    const campaignIds = activeRows.map((row) => row.campaignId);
    const progress = await this.getCampaignProgress(campaignIds, now);

    const active = activeRows.map((row) => ({
      campaignId: row.campaignId,
      name: row.name,
      client: { id: row.clientId, name: row.clientName ?? '' },
      objective: row.objective,
      startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
      endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
      ...(progress.get(row.campaignId) ?? this.emptyCampaignProgress()),
    }));

    return {
      counts: {
        active: counts.active ?? 0,
        draft: counts.draft ?? 0,
        paused: counts.paused ?? 0,
        completed: counts.completed ?? 0,
        canceled: counts.canceled ?? 0,
        endingSoon: activeRows.filter(
          (row) =>
            row.endDate &&
            new Date(row.endDate) >= now &&
            new Date(row.endDate) <= endingSoonCutoff,
        ).length,
        withOverdueTasks: active.filter((row) => row.tasks.overdue > 0).length,
      },
      active,
    };
  }

  private emptyCampaignProgress() {
    return {
      tasks: { total: 0, completed: 0, overdue: 0 },
      posts: { total: 0, published: 0 },
      leads: { total: 0, won: 0 },
    };
  }

  /** BE-14 — objective counts per campaign, three grouped queries, no N+1. */
  private async getCampaignProgress(campaignIds: string[], now: Date) {
    const progress = new Map<
      string,
      ReturnType<typeof this.emptyCampaignProgress>
    >();

    if (campaignIds.length === 0) {
      return progress;
    }

    for (const id of campaignIds) {
      progress.set(id, this.emptyCampaignProgress());
    }

    const [taskRows, postRows, leadRows] = await Promise.all([
      this.tasksRepository
        .createQueryBuilder('t')
        .select('t.campaignId', 'campaignId')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE t.status = :done)', 'completed')
        .addSelect(
          'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate < :now)',
          'overdue',
        )
        .where('t.campaignId IN (:...campaignIds)', { campaignIds })
        .groupBy('t.campaignId')
        .setParameters({ done: TaskStatus.DONE, open: OPEN_TASK_STATUSES, now })
        .getRawMany<CampaignTaskRow>(),
      this.postsRepository
        .createQueryBuilder('p')
        .select('p.campaignId', 'campaignId')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE p.status = :published)', 'published')
        .where('p.campaignId IN (:...campaignIds)', { campaignIds })
        .groupBy('p.campaignId')
        .setParameters({ published: ContentPostStatus.PUBLISHED })
        .getRawMany<CampaignPostRow>(),
      this.leadsRepository
        .createQueryBuilder('l')
        .select('l.campaignId', 'campaignId')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE l.status = :won)', 'won')
        .where('l.campaignId IN (:...campaignIds)', { campaignIds })
        .groupBy('l.campaignId')
        .setParameters({ won: LeadStatus.WON })
        .getRawMany<CampaignLeadRow>(),
    ]);

    for (const row of taskRows) {
      const entry = progress.get(row.campaignId);

      if (entry) {
        entry.tasks = {
          total: num(row.total),
          completed: num(row.completed),
          overdue: num(row.overdue),
        };
      }
    }

    for (const row of postRows) {
      const entry = progress.get(row.campaignId);

      if (entry) {
        entry.posts = { total: num(row.total), published: num(row.published) };
      }
    }

    for (const row of leadRows) {
      const entry = progress.get(row.campaignId);

      if (entry) {
        entry.leads = { total: num(row.total), won: num(row.won) };
      }
    }

    return progress;
  }

  // ---------------------------------------------------------- content plans

  /**
   * BE-15 and BE-16. MISSING is derived here and never stored — an active
   * client with no plan for the selected month is the thing worth chasing.
   */
  async getContentPlans(filters: ContentPlanFilterDto) {
    const fallback = currentMonth();
    const month = filters.month ?? fallback.month;
    const year = filters.year ?? fallback.year;

    const clientsQb = this.companiesRepository
      .createQueryBuilder('c')
      .where('c.status = :active', { active: CompanyStatus.ACTIVE })
      .orderBy('c.name', 'ASC');

    if (filters.clientId) {
      clientsQb.andWhere('c.id = :clientId', { clientId: filters.clientId });
    }

    const plansQb = this.contentPlansRepository
      .createQueryBuilder('p')
      .leftJoin('p.createdBy', 'author')
      .select('p.id', 'planId')
      .addSelect('p.company_id', 'clientId')
      .addSelect('p.status', 'status')
      .addSelect('p.title', 'title')
      .addSelect('author.id', 'authorId')
      .addSelect('author.full_name', 'authorName')
      .where('p.month = :month', { month })
      .andWhere('p.year = :year', { year });

    this.scopeToClient(plansQb, 'p', filters.clientId);

    const [clients, planRows] = await Promise.all([
      clientsQb.getMany(),
      plansQb.getRawMany<ContentPlanRow>(),
    ]);

    const plansByClient = new Map(planRows.map((row) => [row.clientId, row]));

    const items = clients.map((client) => {
      const plan = plansByClient.get(client.id);

      return {
        clientId: client.id,
        clientName: client.name,
        planId: plan?.planId ?? null,
        title: plan?.title ?? null,
        status: plan?.status ?? 'MISSING',
        accountManager: plan?.authorId
          ? { id: plan.authorId, name: plan.authorName }
          : null,
        month,
        year,
      };
    });

    const byStatus = items.reduce(
      (acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }),
      {
        DRAFT: 0,
        INTERNAL_REVIEW: 0,
        CLIENT_REVIEW: 0,
        APPROVED: 0,
        ARCHIVED: 0,
        MISSING: 0,
      } as Record<string, number>,
    );

    return { month, year, byStatus, clients: items };
  }

  // ---------------------------------------------------------------- clients

  /** BE-17 and BE-18 — one row per active client, built from grouped queries. */
  async getClients(filters: PaginatedDashboardFilterDto) {
    const now = new Date();
    const { month, year } = currentMonth(now);

    const clientsQb = this.companiesRepository
      .createQueryBuilder('c')
      .where('c.status = :active', { active: CompanyStatus.ACTIVE })
      .orderBy('c.name', 'ASC');

    if (filters.clientId) {
      clientsQb.andWhere('c.id = :clientId', { clientId: filters.clientId });
    }

    const total = await clientsQb.getCount();
    const pagination = this.paginate(filters, total);

    const clients = await clientsQb
      .skip(pagination.skip)
      .take(pagination.limit)
      .getMany();

    if (clients.length === 0) {
      return { items: [], pagination: this.stripSkip(pagination) };
    }

    const clientIds = clients.map((client) => client.id);

    const [taskRows, postRows, leadRows, campaignRows, planRows, waiting] =
      await Promise.all([
        this.tasksRepository
          .createQueryBuilder('t')
          .select('t.companyId', 'clientId')
          .addSelect('COUNT(*) FILTER (WHERE t.status IN (:...open))', 'open')
          .addSelect(
            'COUNT(*) FILTER (WHERE t.status IN (:...open) AND t.dueDate < :now)',
            'overdue',
          )
          .addSelect('COUNT(*) FILTER (WHERE t.status = :blocked)', 'blocked')
          .where('t.companyId IN (:...clientIds)', { clientIds })
          .groupBy('t.companyId')
          .setParameters({
            open: OPEN_TASK_STATUSES,
            blocked: TaskStatus.BLOCKED,
            now,
          })
          .getRawMany<ClientTaskRow>(),
        this.postsRepository
          .createQueryBuilder('p')
          .select('p.companyId', 'clientId')
          .addSelect(
            'COUNT(*) FILTER (WHERE p.status = :readyForClient)',
            'waitingApproval',
          )
          .addSelect(
            'COUNT(*) FILTER (WHERE p.status = :changesRequested)',
            'changesRequested',
          )
          .addSelect(
            'COUNT(*) FILTER (WHERE p.status = :scheduled)',
            'scheduled',
          )
          .addSelect(
            'COUNT(*) FILTER (WHERE p.status = :published)',
            'published',
          )
          .where('p.companyId IN (:...clientIds)', { clientIds })
          .groupBy('p.companyId')
          .setParameters({
            readyForClient: ContentPostStatus.READY_FOR_CLIENT,
            changesRequested: ContentPostStatus.CHANGES_REQUESTED,
            scheduled: ContentPostStatus.SCHEDULED,
            published: ContentPostStatus.PUBLISHED,
          })
          .getRawMany<ClientPostRow>(),
        this.leadsRepository
          .createQueryBuilder('l')
          .select('l.companyId', 'clientId')
          .addSelect('COUNT(*) FILTER (WHERE l.status IN (:...open))', 'open')
          .addSelect(
            'COUNT(*) FILTER (WHERE l.status IN (:...open) AND l.nextFollowUpAt < :now)',
            'overdueFollowUps',
          )
          .where('l.companyId IN (:...clientIds)', { clientIds })
          .groupBy('l.companyId')
          .setParameters({ open: OPEN_LEAD_STATUSES, now })
          .getRawMany<ClientLeadRow>(),
        this.campaignsRepository
          .createQueryBuilder('c')
          .select('c.companyId', 'clientId')
          .addSelect('COUNT(*) FILTER (WHERE c.status = :active)', 'active')
          .where('c.companyId IN (:...clientIds)', { clientIds })
          .groupBy('c.companyId')
          .setParameters({ active: CampaignStatus.ACTIVE })
          .getRawMany<ClientCampaignRow>(),
        this.contentPlansRepository
          .createQueryBuilder('p')
          .select('p.companyId', 'clientId')
          .addSelect('p.status', 'status')
          .where('p.companyId IN (:...clientIds)', { clientIds })
          .andWhere('p.month = :month', { month })
          .andWhere('p.year = :year', { year })
          .getRawMany<ClientPlanRow>(),
        this.getWaitingApprovalRows(filters.clientId),
      ]);

    const byClient = <T extends { clientId: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.clientId, row]));

    const tasks = byClient(taskRows);
    const posts = byClient(postRows);
    const leads = byClient(leadRows);
    const campaigns = byClient(campaignRows);
    const plans = byClient(planRows);

    const oldestApprovalByClient = new Map<string, number>();

    for (const row of waiting) {
      const current = oldestApprovalByClient.get(row.clientId) ?? 0;
      oldestApprovalByClient.set(
        row.clientId,
        Math.max(current, row.waitingHours),
      );
    }

    const items = clients.map((client) => {
      const taskRow = tasks.get(client.id);
      const postRow = posts.get(client.id);
      const leadRow = leads.get(client.id);
      const openTasks = num(taskRow?.open);
      const overdueTasks = num(taskRow?.overdue);
      const planStatus = plans.get(client.id)?.status ?? 'MISSING';

      return {
        clientId: client.id,
        clientName: client.name,
        status: client.status,
        tasks: {
          open: openTasks,
          overdue: overdueTasks,
          blocked: num(taskRow?.blocked),
        },
        content: {
          waitingApproval: num(postRow?.waitingApproval),
          changesRequested: num(postRow?.changesRequested),
          scheduled: num(postRow?.scheduled),
          published: num(postRow?.published),
        },
        leads: {
          open: num(leadRow?.open),
          overdueFollowUps: num(leadRow?.overdueFollowUps),
        },
        campaigns: { active: num(campaigns.get(client.id)?.active) },
        contentPlan: { month, year, status: planStatus },
        // BE-18: the raw inputs only. The scoring formula is the Product
        // Owner's call and is deliberately not computed here.
        healthInputs: {
          overdueTaskRatio: openTasks
            ? Number((overdueTasks / openTasks).toFixed(3))
            : 0,
          blockedTaskCount: num(taskRow?.blocked),
          oldestApprovalAgeHours: oldestApprovalByClient.get(client.id) ?? 0,
          overdueLeadFollowUps: num(leadRow?.overdueFollowUps),
          contentPlanStatus: planStatus,
          campaignIssues: 0,
        },
      };
    });

    return { items, pagination: this.stripSkip(pagination) };
  }

  // ------------------------------------------------------------ automations

  async getAutomations(filters: DashboardFilterDto) {
    const { start, end } = resolveDateRange(filters.from, filters.to);

    const runsQb = this.automationRunsRepository
      .createQueryBuilder('r')
      .select('COUNT(*)', 'runsToday')
      .addSelect('COUNT(*) FILTER (WHERE r.status = :success)', 'successful')
      .addSelect('COUNT(*) FILTER (WHERE r.status = :failed)', 'failed')
      .addSelect('COUNT(*) FILTER (WHERE r.status = :skipped)', 'skipped')
      .where(`${utcColumn('r.created_at')} BETWEEN :start AND :end`)
      .setParameters({
        success: AutomationRunStatus.SUCCESS,
        failed: AutomationRunStatus.FAILED,
        skipped: AutomationRunStatus.SKIPPED,
        start,
        end,
      });

    this.scopeToClient(runsQb, 'r', filters.clientId);

    const rulesQb = this.automationRulesRepository
      .createQueryBuilder('rule')
      .select('COUNT(*) FILTER (WHERE rule.isActive = true)', 'active')
      .addSelect('COUNT(*) FILTER (WHERE rule.isActive = false)', 'inactive');

    this.scopeToClient(rulesQb, 'rule', filters.clientId);

    const failedQb = this.automationRunsRepository
      .createQueryBuilder('r')
      .leftJoin('r.automationRule', 'rule')
      .innerJoin(Company, 'c', 'c.id = r.companyId')
      .select('r.id', 'runId')
      .addSelect('r.automation_rule_id', 'ruleId')
      .addSelect('rule.name', 'ruleName')
      .addSelect('r.company_id', 'clientId')
      .addSelect('c.name', 'clientName')
      .addSelect('r.trigger_type', 'trigger')
      .addSelect('r.action_type', 'action')
      .addSelect(utcColumn('r.created_at'), 'failedAt')
      .addSelect('r.error_message', 'error')
      .where('r.status = :failed', { failed: AutomationRunStatus.FAILED })
      .orderBy('r.created_at', 'DESC')
      .limit(10);

    this.scopeToClient(failedQb, 'r', filters.clientId);

    const [runs, rules, failedRows] = await Promise.all([
      runsQb.getRawOne<AutomationRunsRow>(),
      rulesQb.getRawOne<AutomationRulesRow>(),
      failedQb.getRawMany<FailedRunRow>(),
    ]);

    return {
      runsToday: num(runs?.runsToday),
      successfulRuns: num(runs?.successful),
      failedRuns: num(runs?.failed),
      skippedRuns: num(runs?.skipped),
      activeRules: num(rules?.active),
      inactiveRules: num(rules?.inactive),
      lastFailedRuns: failedRows.map((row) => ({
        runId: row.runId,
        ruleId: row.ruleId,
        ruleName: row.ruleName,
        client: { id: row.clientId, name: row.clientName ?? '' },
        trigger: row.trigger,
        action: row.action,
        failedAt: new Date(row.failedAt).toISOString(),
        error: row.error,
      })),
    };
  }

  private stripSkip(pagination: Pagination & { skip: number }): Pagination {
    return {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
    };
  }
}
