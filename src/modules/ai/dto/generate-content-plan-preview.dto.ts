import {
  ArrayMaxSize,
  IsArray,
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

export class GenerateContentPlanPreviewDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2024)
  @Max(2100)
  year!: number;

  @IsString()
  @MaxLength(1500)
  goal!: string;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(30)
  numberOfPosts?: number;

  @IsOptional()
  @IsIn(['ar', 'en', 'fr', 'de'])
  language?: 'ar' | 'en' | 'fr' | 'de';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsEnum(ContentPlatform, { each: true })
  platforms?: ContentPlatform[];
}