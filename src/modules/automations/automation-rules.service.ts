import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationActionType } from './enums/automation-action-type.enum';
import { AutomationTriggerType } from './enums/automation-trigger-type.enum';

@Injectable()
export class AutomationRulesService {
  constructor(
    @InjectRepository(AutomationRule)
    private readonly automationRulesRepository: Repository<AutomationRule>,
  ) {}

  async create(
    companyId: string,
    dto: CreateAutomationRuleDto,
    currentUser: RequestUser,
  ): Promise<AutomationRule> {
    this.validateTriggerActionPair(dto.triggerType, dto.actionType);

    const rule = this.automationRulesRepository.create({
      companyId,
      name: dto.name.trim(),
      triggerType: dto.triggerType,
      actionType: dto.actionType,
      isActive: dto.isActive ?? true,
      config: dto.config ?? {},
      createdById: currentUser.id,
    });

    return this.automationRulesRepository.save(rule);
  }

  async findAll(companyId: string): Promise<AutomationRule[]> {
    return this.automationRulesRepository.find({
      where: {
        companyId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(
    companyId: string,
    automationRuleId: string,
  ): Promise<AutomationRule> {
    const rule = await this.automationRulesRepository.findOne({
      where: {
        id: automationRuleId,
        companyId,
      },
    });

    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }

    return rule;
  }

  async update(
    companyId: string,
    automationRuleId: string,
    dto: UpdateAutomationRuleDto,
  ): Promise<AutomationRule> {
    const rule = await this.findOne(companyId, automationRuleId);

    const nextTriggerType = dto.triggerType ?? rule.triggerType;
    const nextActionType = dto.actionType ?? rule.actionType;

    this.validateTriggerActionPair(nextTriggerType, nextActionType);

    if (dto.name !== undefined) {
      rule.name = dto.name.trim();
    }

    if (dto.triggerType !== undefined) {
      rule.triggerType = dto.triggerType;
    }

    if (dto.actionType !== undefined) {
      rule.actionType = dto.actionType;
    }

    if (dto.isActive !== undefined) {
      rule.isActive = dto.isActive;
    }

    if (dto.config !== undefined) {
      rule.config = dto.config;
    }

    return this.automationRulesRepository.save(rule);
  }

  async findActiveRulesForTrigger(
    companyId: string,
    triggerType: AutomationTriggerType,
  ): Promise<AutomationRule[]> {
    return this.automationRulesRepository.find({
      where: {
        companyId,
        triggerType,
        isActive: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  private validateTriggerActionPair(
    triggerType: AutomationTriggerType,
    actionType: AutomationActionType,
  ): void {
    const validPairs: Record<AutomationTriggerType, AutomationActionType[]> = {
      [AutomationTriggerType.POST_CHANGES_REQUESTED]: [
        AutomationActionType.CREATE_POST_CHANGES_TASKS,
      ],
      [AutomationTriggerType.LEAD_BECAME_INTERESTED]: [
        AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK,
      ],
    };

    if (!validPairs[triggerType]?.includes(actionType)) {
      throw new BadRequestException(
        `Invalid automation pair: ${triggerType} cannot execute ${actionType}`,
      );
    }
  }
}