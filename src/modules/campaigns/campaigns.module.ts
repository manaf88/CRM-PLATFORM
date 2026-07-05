import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { ContentPost } from '../content/entities/content-post.entity';
import { Lead } from '../leads/entities/lead.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { Task } from '../tasks/entities/task.entity';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from './entities/campaign.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      ContentPost,
      Lead,
      Task,
    ]),
    MembershipsModule,
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}