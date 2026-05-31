import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { ContentPost } from '../content/entities/content-post.entity';
import { Lead } from '../leads/entities/lead.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { Report } from './entities/report.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      ContentPost,
      Lead,
    ]),
    MembershipsModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}