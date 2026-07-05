import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';

import { AssignResponsibilityDto } from './assign-responsibility.dto';

export class BulkAssignResponsibilitiesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AssignResponsibilityDto)
  items!: AssignResponsibilityDto[];
}