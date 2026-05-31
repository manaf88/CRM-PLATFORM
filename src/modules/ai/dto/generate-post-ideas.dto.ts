import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ContentPlatform } from '../../content/enums/content-platform.enum';
import { ContentType } from '../../content/enums/content-type.enum';

export class GeneratePostIdeasDto {
  @IsString()
  @MaxLength(1500)
  goal!: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  count?: number;

  @IsOptional()
  @IsIn(['ar', 'en', 'fr', 'de'])
  language?: 'ar' | 'en' | 'fr' | 'de';

  @IsOptional()
  @IsEnum(ContentPlatform)
  platform?: ContentPlatform;

  @IsOptional()
  @IsEnum(ContentType)
  contentType?: ContentType;
}