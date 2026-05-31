import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyMembership } from './entities/company-membership.entity';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyMembership])],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}