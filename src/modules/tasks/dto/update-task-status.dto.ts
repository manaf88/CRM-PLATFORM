import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { TaskStatus } from '../enums/task-status.enum';

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}