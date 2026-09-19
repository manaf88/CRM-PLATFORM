import { IsEnum } from 'class-validator';

import { TaskType } from '../enums/task-type.enum';

export class ResolveApproverQueryDto {
  @IsEnum(TaskType)
  taskType!: TaskType;
}
