import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { Company } from './entities/company.entity';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    MembershipsModule,
  ],
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    CompanyAccessGuard,
    PlatformRolesGuard,
  ],
  exports: [CompaniesService],
})
export class CompaniesModule {}