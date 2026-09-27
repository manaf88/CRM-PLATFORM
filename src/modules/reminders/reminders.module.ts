import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ContentPost } from '../content/entities/content-post.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';
import { DailyDigestService } from './daily-digest.service';
import { ReviewAgeingService } from './review-ageing.service';

/**
 * The two jobs that notice when nothing is happening: reminders on reviews
 * that have been sitting, and the morning email for anybody with a queue.
 *
 * Their own module rather than a corner of tasks — they read across tasks,
 * posts and memberships, and they are the part of the system it is normal to
 * want to switch off on a particular deployment.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Task, ContentPost, Notification, User]),
    NotificationsModule,
    MembershipsModule,
  ],
  providers: [ReviewAgeingService, DailyDigestService],
  exports: [ReviewAgeingService, DailyDigestService],
})
export class RemindersModule {}
