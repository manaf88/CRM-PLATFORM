import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { TaskPriority } from '../enums/task-priority.enum';
import { TaskRelatedEntityType } from '../enums/task-related-entity-type.enum';
import { TaskType } from '../enums/task-type.enum';

export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsEnum(TaskRelatedEntityType)
  relatedEntityType?: TaskRelatedEntityType;

  @ValidateIf((dto) => dto.relatedEntityType !== undefined)
  @IsUUID()
  relatedEntityId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}