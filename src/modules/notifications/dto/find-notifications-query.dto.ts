import { Type } from 'class-transformer';
import {
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