import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { BrandColorItemDto } from './brand-color-item.dto';
import { BrandOfferItemDto } from './brand-offer-item.dto';
import { BrandServiceItemDto } from './brand-service-item.dto';

export class CreateBrandProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  brandName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  toneOfVoice?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(['ar', 'en', 'fr', 'de'], { each: true })
  languages?: Array<'ar' | 'en' | 'fr' | 'de'>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => BrandColorItemDto)
  colors?: BrandColorItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BrandServiceItemDto)
  services?: BrandServiceItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BrandOfferItemDto)
  offers?: BrandOfferItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  serviceAreas?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  ctaPreferences?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  forbiddenWords?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  brandNotes?: string;
}