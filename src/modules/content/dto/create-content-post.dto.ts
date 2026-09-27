import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ContentPlatform } from '../enums/content-platform.enum';
import { ContentType } from '../enums/content-type.enum';

export class CreateContentPostDto {
  @IsOptional()
  @IsUUID()
  contentPlanId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsEnum(ContentType)
  contentType!: ContentType;

  @IsEnum(ContentPlatform)
  platform!: ContentPlatform;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  visualBrief?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  publishedUrl?: string;

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
}
