import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { ContentPost } from '../content/entities/content-post.entity';
import { Lead } from '../leads/entities/lead.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { Company } from '../companies/entities/company.entity';
import { ReportShareToken } from './entities/report-share-token.entity';
import { Report } from './entities/report.entity';
import { PublicReportsController } from './public-reports.controller';
import { ReportSharesService } from './report-shares.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      ReportShareToken,
      ContentPost,
      Lead,
      Company,
    ]),
    MembershipsModule,
  ],
  controllers: [ReportsController, PublicReportsController],
  providers: [
    ReportsService,
    ReportSharesService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [ReportsService, ReportSharesService],
})
export class ReportsModule {}
