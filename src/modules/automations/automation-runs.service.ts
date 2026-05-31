import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FindAutomationRunsQueryDto } from './dto/find-automation-runs-query.dto';
import { AutomationRun } from './entities/automation-run.entity';
import { AutomationActionType } from './enums/automation-action-type.enum';
import { AutomationRunStatus } from './enums/automation-run-status.enum';
import { AutomationTriggerType } from './enums/automation-trigger-type.enum';

type CreateAutomationRunInput = {
  companyId: string;
  automationRuleId?: string | null;
  triggerType: AutomationTriggerType;
  actionType: AutomationActionType;
  status: AutomationRunStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string | null;
};

@Injectable()
export class AutomationRunsService {
  constructor(
    @InjectRepository(AutomationRun)
    private readonly automationRunsRepository: Repository<AutomationRun>,
  ) {}

  async create(input: CreateAutomationRunInput): Promise<AutomationRun> {
    const run = this.automationRunsRepository.create({
      companyId: input.companyId,
      automationRuleId: input.automationRuleId ?? null,
      triggerType: input.triggerType,
      actionType: input.actionType,
      status: input.status,
      input: input.input ?? {},
      output: input.output ?? {},
      errorMessage: input.errorMessage ?? null,
    });

    return this.automationRunsRepository.save(run);
  }

  async findAll(companyId: string, query: FindAutomationRunsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = {
      companyId,
    };

    if (query.triggerType) {
      where.triggerType = query.triggerType;
    }

    if (query.actionType) {
      where.actionType = query.actionType;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await this.automationRunsRepository.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(
    companyId: string,
    automationRunId: string,
  ): Promise<AutomationRun> {
    const run = await this.automationRunsRepository.findOne({
      where: {
        id: automationRunId,
        companyId,
      },
    });

    if (!run) {
      throw new NotFoundException('Automation run not found');
    }

    return run;
  }
}