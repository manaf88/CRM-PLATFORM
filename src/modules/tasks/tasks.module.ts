import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { FileEntity } from '../files/entities/file.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { ResponsibilityArea } from '../responsibilities/entities/responsibility-area.entity';
import { ResponsibilityAssignment } from '../responsibilities/entities/responsibility-assignment.entity';
import { TaskActivityLog } from './entities/task-activity-log.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskComment } from './entities/task-comment.entity';
import { Task } from './entities/task.entity';
import { TasksController } from './tasks.controller';
import { TaskApproverResolverService } from './task-approver-resolver.service';
import { TasksService } from './tasks.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      TaskComment,
      TaskActivityLog,
      TaskAttachment,
      FileEntity,
      // Read-only here: the approver of a task is looked up in the matrix, the
      // matrix itself is owned by the responsibilities module.
      ResponsibilityArea,
      ResponsibilityAssignment,
    ]),
    MembershipsModule,
    NotificationsModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskApproverResolverService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [TasksService, TaskApproverResolverService],
})
export class TasksModule {}
