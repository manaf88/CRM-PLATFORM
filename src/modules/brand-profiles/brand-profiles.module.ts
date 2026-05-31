import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { BrandProfilesController } from './brand-profiles.controller';
import { BrandProfilesService } from './brand-profiles.service';
import { BrandProfile } from './entities/brand-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BrandProfile]),
    MembershipsModule,
  ],
  controllers: [BrandProfilesController],
  providers: [
    BrandProfilesService,
    CompanyAccessGuard,
  ],
  exports: [BrandProfilesService],
})
export class BrandProfilesModule {}