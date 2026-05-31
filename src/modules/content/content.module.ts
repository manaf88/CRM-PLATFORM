import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompaniesModule } from '../companies/companies.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { ContentPlansController } from './content-plans.controller';
import { ContentPlansService } from './content-plans.service';
import { ContentPostsController } from './content-posts.controller';
import { ContentPostsService } from './content-posts.service';
import { ContentPlan } from './entities/content-plan.entity';
import { ContentPost } from './entities/content-post.entity';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([ContentPlan, ContentPost]),
    CompaniesModule,
    MembershipsModule,
  ],
  controllers: [
    ContentPlansController,
    ContentPostsController,
  ],
  providers: [
    ContentPlansService,
    ContentPostsService,
    CompanyAccessGuard,
      CompanyRolesGuard,

  ],
  exports: [
    ContentPlansService,
    ContentPostsService,
  ],
})
export class ContentModule {}