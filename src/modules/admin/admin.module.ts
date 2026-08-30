import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PostApprovalLog } from '../approvals/entities/post-approval-log.entity';
import { AutomationRule } from '../automations/entities/automation-rule.entity';
import { AutomationRun } from '../automations/entities/automation-run.entity';
import { Campaign } from '../campaigns/entities/campaign.entity';
import { Company } from '../companies/entities/company.entity';
import { ContentPlan } from '../content/entities/content-plan.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { FilesModule } from '../files/files.module';
import { Lead } from '../leads/entities/lead.entity';
import { LeadStatusHistory } from '../leads/entities/lead-status-history.entity';
import { CompanyMembership } from '../memberships/entities/company-membership.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskActivityLog } from '../tasks/entities/task-activity-log.entity';
import { User } from '../users/entities/user.entity';
import { AdminActivityService } from './admin-activity.service';
import { AdminAttentionService } from './admin-attention.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminSystemController } from './admin-system.controller';
import { AdminSystemService } from './admin-system.service';

/**
 * The Super Admin / Admin operations area.
 *
 * Reads straight from the repositories of the other domains rather than going
 * through their services: those are all scoped to one client by design, and the
 * point of this module is the cross-client view. Nothing here writes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      CompanyMembership,
      Task,
      TaskActivityLog,
      ContentPost,
      ContentPlan,
      PostApprovalLog,
      Lead,
      LeadStatusHistory,
      Campaign,
      AutomationRule,
      AutomationRun,
    ]),
    FilesModule,
  ],
  controllers: [AdminDashboardController, AdminSystemController],
  providers: [
    AdminDashboardService,
    AdminAttentionService,
    AdminActivityService,
    AdminSystemService,
  ],
})
export class AdminModule {}
