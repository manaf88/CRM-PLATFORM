import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { FileEntity } from '../files/entities/file.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { TaskActivityLog } from './entities/task-activity-log.entity';
import { TaskAttachment } from './entities/task-attachment.entity';
import { TaskComment } from './entities/task-comment.entity';
import { Task } from './entities/task.entity';
import { TasksController } from './tasks.controller';
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
    ]),
    MembershipsModule,
    NotificationsModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [TasksService],
})
export class TasksModule {}