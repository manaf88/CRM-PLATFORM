import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { LeadLostReason } from '../enums/lead-lost-reason.enum';
import { LeadStatus } from '../enums/lead-status.enum';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Only meaningful with status LOST; rejected with any other status. */
  @IsOptional()
  @IsEnum(LeadLostReason)
  lostReason?: LeadLostReason;

  /** Only meaningful with status WON; rejected with any other status. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999_999_999)
  dealValue?: number;
}
