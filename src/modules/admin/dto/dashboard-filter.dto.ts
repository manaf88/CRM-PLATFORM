import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { TaskPriority } from '../../tasks/enums/task-priority.enum';

/**
 * The filter every dashboard endpoint accepts (BE-02).
 *
 * Defaults are applied in the service, not here, so that "no from/to" can be
 * told apart from "from/to explicitly set to today" if that ever matters.
 */
export class DashboardFilterDto {
  /** Start of the range. Defaults to today. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** End of the range. Defaults to `from`, which defaults to today. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** One client. Defaults to all clients. */
  @IsOptional()
  @IsUUID()
  clientId?: string;

  /** One employee. Defaults to all employees. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  /**
   * Domain status. Left as a plain string because its meaning depends on the
   * endpoint — task status here, post status there. Each service validates it
   * against its own enum and ignores anything it does not recognise.
   */
  @IsOptional()
  status?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

export class PaginatedDashboardFilterDto extends DashboardFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ContentPlanFilterDto extends DashboardFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class ActivityFilterDto extends PaginatedDashboardFilterDto {
  /** Filter by the person who acted. */
  @IsOptional()
  @IsUUID()
  userId?: string;

  /** POST | TASK | LEAD */
  @IsOptional()
  @IsIn(['POST', 'TASK', 'LEAD'])
  entityType?: 'POST' | 'TASK' | 'LEAD';
}
