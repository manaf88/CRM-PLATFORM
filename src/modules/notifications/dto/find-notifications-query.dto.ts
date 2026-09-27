import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { NotificationReadStatus } from '../enums/notification-read-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export class FindNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationReadStatus)
  readStatus?: NotificationReadStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  /** Show the types this user has muted as well. Off by default. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeMuted?: boolean;

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
