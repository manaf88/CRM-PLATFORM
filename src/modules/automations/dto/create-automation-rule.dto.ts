import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { AutomationActionType } from '../enums/automation-action-type.enum';
import { AutomationTriggerType } from '../enums/automation-trigger-type.enum';

export class CreateAutomationRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsEnum(AutomationTriggerType)
  triggerType!: AutomationTriggerType;

  @IsEnum(AutomationActionType)
  actionType!: AutomationActionType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}