/**
 * Shapes returned by the dashboard's raw aggregate queries.
 *
 * Postgres hands back `COUNT(...)` as a string and timestamps as `Date`, so
 * these types describe what actually arrives rather than what the column looks
 * like on the entity. Every count goes through `num()` before it is returned.
 */

import { TaskPriority } from '../tasks/enums/task-priority.enum';
import { TaskStatus } from '../tasks/enums/task-status.enum';

export type Timestamp = Date | string;

export type CountRow = { count: string };

export type StatusCountRow = { status: string; count: string };

export type ClientCountRow = { clientId: string; count: string };

export type OverviewTaskRow = {
  dueToday: string;
  overdue: string;
  blocked: string;
};

export type OverviewPostRow = { waiting: string };

export type OverviewLeadRow = {
  followUpsToday: string;
  overdueFollowUps: string;
};

export type TaskMetricsRow = {
  openTotal: string;
  todo: string;
  inProgress: string;
  inReview: string;
  blocked: string;
  dueToday: string;
  overdue: string;
  urgent: string;
  highPriority: string;
  unassigned: string;
  completedToday: string;
};

export type WorkloadTaskRow = {
  userId: string;
  openTasks: string;
  dueToday: string;
  overdue: string;
  blocked: string;
  inReview: string;
  urgent: string;
  activeClients: string;
};

export type MembershipCountRow = { userId: string; clients: string };

export type ContentExtrasRow = {
  scheduledToday: string;
  publishingDue: string;
};

export type WaitingApprovalRawRow = {
  postId: string;
  title: string;
  status: string;
  clientId: string;
  clientName: string;
  waitingSince: Timestamp;
};

export type ApprovalTodayRow = {
  approvedToday: string;
  rejectedToday: string;
};

export type LeadExtrasRow = {
  newToday: string;
  followUpsToday: string;
  overdueFollowUps: string;
  wonThisMonth: string;
  lostThisMonth: string;
};

export type OverdueLeadRow = {
  leadId: string;
  leadName: string;
  status: string;
  followUpDate: Timestamp;
  clientId: string;
  clientName: string;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type ActiveCampaignRow = {
  campaignId: string;
  name: string;
  objective: string;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  clientId: string;
  clientName: string;
};

export type CampaignTaskRow = {
  campaignId: string;
  total: string;
  completed: string;
  overdue: string;
};

export type CampaignPostRow = {
  campaignId: string;
  total: string;
  published: string;
};

export type CampaignLeadRow = {
  campaignId: string;
  total: string;
  won: string;
};

export type ContentPlanRow = {
  planId: string;
  clientId: string;
  status: string;
  title: string;
  authorId: string | null;
  authorName: string | null;
};

export type ClientTaskRow = {
  clientId: string;
  open: string;
  overdue: string;
  blocked: string;
};

export type ClientPostRow = {
  clientId: string;
  waitingApproval: string;
  changesRequested: string;
  scheduled: string;
  published: string;
};

export type ClientLeadRow = {
  clientId: string;
  open: string;
  overdueFollowUps: string;
};

export type ClientCampaignRow = { clientId: string; active: string };

export type ClientPlanRow = { clientId: string; status: string };

export type AutomationRunsRow = {
  runsToday: string;
  successful: string;
  failed: string;
  skipped: string;
};

export type AutomationRulesRow = { active: string; inactive: string };

export type FailedRunRow = {
  runId: string;
  ruleId: string | null;
  ruleName: string | null;
  clientId: string;
  clientName: string;
  trigger: string;
  action: string;
  failedAt: Timestamp;
  error: string | null;
};

export type AttentionTaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Timestamp | null;
  updatedAt: Timestamp;
  clientId: string;
  clientName: string;
  ownerId: string | null;
  ownerName: string | null;
};

export type AttentionPostRow = {
  id: string;
  title: string;
  scheduledAt: Timestamp;
  clientId: string;
  clientName: string;
  ownerId: string | null;
  ownerName: string | null;
};

export type AttentionChangesRow = {
  id: string;
  title: string;
  updatedAt: Timestamp;
  clientId: string;
  clientName: string;
  ownerId: string | null;
  ownerName: string | null;
};

export type AttentionLeadRow = {
  id: string;
  title: string;
  followUpAt: Timestamp;
  clientId: string;
  clientName: string;
  ownerId: string | null;
  ownerName: string | null;
};

export type AttentionCampaignRow = {
  id: string;
  title: string;
  endDate: Timestamp;
  clientId: string;
  clientName: string;
  openTasks: string;
};

export type PostLogRow = {
  id: string;
  action: string;
  entityId: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Timestamp;
  clientId: string;
  clientName: string;
  actorId: string | null;
  actorName: string | null;
};

export type TaskLogRow = {
  id: string;
  action: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Timestamp;
  clientId: string;
  clientName: string;
  actorId: string | null;
  actorName: string | null;
};

export type LeadLogRow = {
  id: string;
  entityId: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Timestamp;
  clientId: string;
  clientName: string;
  actorId: string | null;
  actorName: string | null;
};

/**
 * `created_at` / `updated_at` are `timestamp WITHOUT time zone` (TypeORM's
 * default for @CreateDateColumn) while the domain dates — due_date,
 * scheduled_at, next_follow_up_at — are `timestamptz`. Comparing a naive
 * column against a JS Date only works by accident, when the API process runs
 * in the same timezone the rows were written in. These columns hold UTC, so
 * say so in the SQL and the comparison is correct wherever the server runs.
 */
export const utcColumn = (column: string): string =>
  `(${column} AT TIME ZONE 'UTC')`;
