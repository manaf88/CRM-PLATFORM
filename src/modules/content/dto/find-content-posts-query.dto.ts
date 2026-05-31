import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { ContentPlatform } from '../enums/content-platform.enum';
import { ContentPostStatus } from '../enums/content-post-status.enum';
import { ContentType } from '../enums/content-type.enum';

export class FindContentPostsQueryDto {
  @IsOptional()
  @IsUUID()
  contentPlanId?: string;

  @IsOptional()
  @IsEnum(ContentPostStatus)
  status?: ContentPostStatus;

  @IsOptional()
  @IsEnum(ContentPlatform)
  platform?: ContentPlatform;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;
}