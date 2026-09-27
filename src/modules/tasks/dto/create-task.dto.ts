import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

  /**
   * Left out on purpose in most cases: when it is absent the approver is read
   * from the responsibility matrix for this client and task type.
   */
  @IsOptional()
  @IsUUID()
  approverId?: string;

  @IsOptional()
  @IsEnum(TaskRelatedEntityType)
  relatedEntityType?: TaskRelatedEntityType;

  @ValidateIf((dto) => dto.relatedEntityType !== undefined)
  @IsUUID()
  relatedEntityId?: string;

  /**
   * Position in the post's internal chain. Only accepted on a task linked to
   * a post, and no two tasks on one post may claim the same number.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  sequence?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /**
   * Files the user picked in the create form. They are uploaded first and
   * attached with the record in one transaction, so a rejected create leaves
   * no half-attached files behind.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  attachmentFileIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}
