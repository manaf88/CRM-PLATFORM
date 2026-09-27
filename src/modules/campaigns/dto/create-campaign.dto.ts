import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CampaignObjective } from '../enums/campaign-objective.enum';

export class CreateCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsEnum(CampaignObjective)
  objective?: CampaignObjective;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  targetAudience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

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
