import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { LeadStatus } from '../enums/lead-status.enum';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}