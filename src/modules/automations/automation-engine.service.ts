import {
  Injectable,
  Logger,
} from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { TaskPriority } from '../tasks/enums/task-priority.enum';
import { TaskRelatedEntityType } from '../tasks/enums/task-related-entity-type.enum';
import { TaskType } from '../tasks/enums/task-type.enum';
import { TasksService } from '../tasks/tasks.service';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationActionType } from './enums/automation-action-type.enum';
import { AutomationRunStatus } from './enums/automation-run-status.enum';
import { AutomationTriggerType } from './enums/automation-trigger-type.enum';

type PostChangesRequestedInput = {
  companyId: string;
  postId: string;
  postTitle: string;
  currentUser: RequestUser;
};

type LeadBecameInterestedInput = {
  companyId: string;
  leadId: string;
  leadName: string;
  assignedToId: string | null;
  currentUser: RequestUser;
};

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    private readonly automationRulesService: AutomationRulesService,
    private readonly automationRunsService: AutomationRunsService,
    private readonly tasksService: TasksService,
    private readonly membershipsService: MembershipsService,
  ) {}

  async handlePostChangesRequested(
    input: PostChangesRequestedInput,
  ): Promise<void> {
    const rules =
      await this.automationRulesService.findActiveRulesForTrigger(
        input.companyId,
        AutomationTriggerType.POST_CHANGES_REQUESTED,
      );

    for (const rule of rules) {
      await this.executeRuleSafely({
        rule,
        input,
        execute: () => this.executePostChangesRequestedRule(rule, input),
      });
    }
  }

  async handleLeadBecameInterested(
    input: LeadBecameInterestedInput,
  ): Promise<void> {
    const rules =
      await this.automationRulesService.findActiveRulesForTrigger(
        input.companyId,
        AutomationTriggerType.LEAD_BECAME_INTERESTED,
      );

    for (const rule of rules) {
      await this.executeRuleSafely({
        rule,
        input,
        execute: () => this.executeLeadBecameInterestedRule(rule, input),
      });
    }
  }

  private async executePostChangesRequestedRule(
    rule: AutomationRule,
    input: PostChangesRequestedInput,
  ): Promise<Record<string, unknown>> {
    if (rule.actionType !== AutomationActionType.CREATE_POST_CHANGES_TASKS) {
      return {
        skipped: true,
        reason: 'Unsupported action for this trigger',
      };
    }

    const config = rule.config ?? {};
    const priority = this.parseTaskPriority(config.priority, TaskPriority.HIGH);
    const copywritingDueInDays = this.parseNumber(
      config.copywritingDueInDays,
      1,
    );
    const designDueInDays = this.parseNumber(config.designDueInDays, 1);

    const shouldCreateCopywritingTask =
      config.createCopywritingTask !== false;

    const shouldCreateDesignTask =
      config.createDesignTask !== false;

    const createdTasks: Array<{ id: string; title: string }> = [];

    if (shouldCreateCopywritingTask) {
      const assignedToId = await this.findFirstUserByRoles(input.companyId, [
        CompanyMembershipRole.COPYWRITER,
        CompanyMembershipRole.ACCOUNT_MANAGER,
      ]);

      const task = await this.tasksService.create(
        input.companyId,
        {
          title: `Revise copy for post: ${input.postTitle}`,
          description:
            'Client requested changes. Review the caption and update the copy before resubmitting.',
          taskType: TaskType.COPYWRITING,
          priority,
          assignedToId: assignedToId ?? undefined,
          relatedEntityType: TaskRelatedEntityType.POST,
          relatedEntityId: input.postId,
          dueDate: this.buildDueDate(copywritingDueInDays),
          notes: 'Created automatically by automation rule.',
        } satisfies CreateTaskDto,
        input.currentUser,
      );

      createdTasks.push({
        id: task.id,
        title: task.title,
      });
    }

    if (shouldCreateDesignTask) {
      const assignedToId = await this.findFirstUserByRoles(input.companyId, [
        CompanyMembershipRole.DESIGNER,
        CompanyMembershipRole.ACCOUNT_MANAGER,
      ]);

      const task = await this.tasksService.create(
        input.companyId,
        {
          title: `Revise design for post: ${input.postTitle}`,
          description:
            'Client requested changes. Review the design/visual direction before resubmitting.',
          taskType: TaskType.DESIGN,
          priority,
          assignedToId: assignedToId ?? undefined,
          relatedEntityType: TaskRelatedEntityType.POST,
          relatedEntityId: input.postId,
          dueDate: this.buildDueDate(designDueInDays),
          notes: 'Created automatically by automation rule.',
        } satisfies CreateTaskDto,
        input.currentUser,
      );

      createdTasks.push({
        id: task.id,
        title: task.title,
      });
    }

    return {
      createdTasks,
    };
  }

  private async executeLeadBecameInterestedRule(
    rule: AutomationRule,
    input: LeadBecameInterestedInput,
  ): Promise<Record<string, unknown>> {
    if (
      rule.actionType !== AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK
    ) {
      return {
        skipped: true,
        reason: 'Unsupported action for this trigger',
      };
    }

    const config = rule.config ?? {};
    const dueInDays = this.parseNumber(config.dueInDays, 2);
    const priority = this.parseTaskPriority(
      config.priority,
      TaskPriority.MEDIUM,
    );

    const titleTemplate =
      typeof config.titleTemplate === 'string'
        ? config.titleTemplate
        : 'Follow up with interested lead';

    const assignedToId =
      input.assignedToId ??
      (await this.findFirstUserByRoles(input.companyId, [
        CompanyMembershipRole.SALES_AGENT,
        CompanyMembershipRole.ACCOUNT_MANAGER,
      ]));

    const task = await this.tasksService.create(
      input.companyId,
      {
        title: `${titleTemplate}: ${input.leadName}`,
        description:
          'Lead became interested. Follow up and move the opportunity forward.',
        taskType: TaskType.FOLLOW_UP,
        priority,
        assignedToId: assignedToId ?? undefined,
        relatedEntityType: TaskRelatedEntityType.LEAD,
        relatedEntityId: input.leadId,
        dueDate: this.buildDueDate(dueInDays),
        notes: 'Created automatically by automation rule.',
      } satisfies CreateTaskDto,
      input.currentUser,
    );

    return {
      createdTask: {
        id: task.id,
        title: task.title,
      },
    };
  }

  private async executeRuleSafely(input: {
    rule: AutomationRule;
    input: Record<string, unknown>;
    execute: () => Promise<Record<string, unknown>>;
  }): Promise<void> {
    const { rule } = input;

    try {
      const output = await input.execute();

      await this.automationRunsService.create({
        companyId: rule.companyId,
        automationRuleId: rule.id,
        triggerType: rule.triggerType,
        actionType: rule.actionType,
        status: output.skipped
          ? AutomationRunStatus.SKIPPED
          : AutomationRunStatus.SUCCESS,
        input: input.input,
        output,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Automation rule failed: ${rule.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.automationRunsService.create({
        companyId: rule.companyId,
        automationRuleId: rule.id,
        triggerType: rule.triggerType,
        actionType: rule.actionType,
        status: AutomationRunStatus.FAILED,
        input: input.input,
        output: {},
        errorMessage,
      });
    }
  }

  private async findFirstUserByRoles(
    companyId: string,
    roles: CompanyMembershipRole[],
  ): Promise<string | null> {
    const members = await this.membershipsService.findActiveMembersByRoles(
      companyId,
      roles,
    );

    return members[0]?.userId ?? null;
  }

  private buildDueDate(daysFromNow: number): string {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysFromNow);

    return dueDate.toISOString();
  }

  private parseNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return fallback;
  }

  private parseTaskPriority(
    value: unknown,
    fallback: TaskPriority,
  ): TaskPriority {
    if (
      typeof value === 'string' &&
      Object.values(TaskPriority).includes(value as TaskPriority)
    ) {
      return value as TaskPriority;
    }

    return fallback;
  }
}