import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { ContentPost } from '../content/entities/content-post.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { PostApprovalLog } from './entities/post-approval-log.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostApprovalsController } from './post-approvals.controller';
import { PostApprovalsService } from './post-approvals.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationsModule } from '../automations/automations.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentPost,
      PostComment,
      PostApprovalLog,
    ]),
    MembershipsModule,
    NotificationsModule,
    AutomationsModule,
  ],
  controllers: [PostApprovalsController],
  providers: [
    PostApprovalsService,
    CompanyAccessGuard,
      CompanyRolesGuard,

  ],
  exports: [PostApprovalsService],
})
export class ApprovalsModule {}