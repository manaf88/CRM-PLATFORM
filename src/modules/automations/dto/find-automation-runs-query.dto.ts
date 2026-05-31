import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import { AutomationActionType } from '../enums/automation-action-type.enum';
import { AutomationRunStatus } from '../enums/automation-run-status.enum';
import { AutomationTriggerType } from '../enums/automation-trigger-type.enum';

export class FindAutomationRunsQueryDto {
  @IsOptional()
  @IsEnum(AutomationTriggerType)
  triggerType?: AutomationTriggerType;

  @IsOptional()
  @IsEnum(AutomationActionType)
  actionType?: AutomationActionType;

  @IsOptional()
  @IsEnum(AutomationRunStatus)
  status?: AutomationRunStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}