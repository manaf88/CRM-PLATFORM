import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';

import { ContentPlanStatus } from '../enums/content-plan-status.enum';
import { CreateContentPlanDto } from './create-content-plan.dto';

export class UpdateContentPlanDto extends PartialType(
  CreateContentPlanDto,
) {
  @IsOptional()
  @IsEnum(ContentPlanStatus)
  status?: ContentPlanStatus;
}