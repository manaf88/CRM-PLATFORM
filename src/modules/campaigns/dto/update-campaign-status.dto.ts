import { IsEnum } from 'class-validator';

import { CampaignStatus } from '../enums/campaign-status.enum';

export class UpdateCampaignStatusDto {
  @IsEnum(CampaignStatus)
  status!: CampaignStatus;
}