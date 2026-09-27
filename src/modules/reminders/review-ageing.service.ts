import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';

import { hoursSince } from '../../common/utils/dashboard-time.util';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationEntityType } from '../notifications/enums/notification-entity-type.enum';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Tells somebody when a review has been sitting.
 *
 * At 24 hours the approver hears about it; at 48 the account managers for that
 * client do, because by then it is not the approver's oversight any more, it
 * is the account's problem.
 *
 * Sent at most once per task per threshold *per round*: re-submitting after
 * changes clears and re-stamps `submittedForReviewAt`, and a notice written
 * before that stamp belongs to the previous round, so the clock genuinely
 * starts again.
 */
@Injectable()
export class ReviewAgeingService {
  private readonly logger = new Logger(ReviewAgeingService.name);

  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,

    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,

    private readonly notificationsService: NotificationsService,
    private readonly membershipsService: MembershipsService,
  ) {}

  // Every quarter hour. The thresholds are whole days, so this is about
  // spreading the work, not precision.
  @Cron('*/15 * * * *', { name: 'review-ageing' })
  async sweep(): Promise<{ notified24h: number; notified48h: number }> {
    const now = new Date();

    const waiting = await this.tasksRepository.find({
      where: {
        status: TaskStatus.IN_REVIEW,
        submittedForReviewAt: LessThanOrEqual(
          new Date(now.getTime() - 24 * HOUR_MS),
        ),
      },
      relations: {
        assignedTo: true,
        approver: true,
      },
      order: {
        submittedForReviewAt: 'ASC',
      },
    });

    let notified24h = 0;
    let notified48h = 0;

    for (const task of waiting) {
      if (!task.submittedForReviewAt) {
        continue;
      }

      const waitingHours = hoursSince(task.submittedForReviewAt, now);

      try {
        if (await this.notifyApprover(task, waitingHours)) {
          notified24h += 1;
        }

        if (waitingHours >= 48 && (await this.notifyAccountManagers(task, waitingHours))) {
          notified48h += 1;
        }
      } catch (error) {
        // One bad task must not stop the sweep for every other one.
        this.logger.error(
          `Ageing sweep failed for task ${task.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (notified24h || notified48h) {
      this.logger.log(
        `Review ageing: ${notified24h} approver reminders, ${notified48h} escalations`,
      );
    }

    return { notified24h, notified48h };
  }

  private async notifyApprover(
    task: Task,
    waitingHours: number,
  ): Promise<boolean> {
    if (!task.approverId) {
      return false;
    }

    const alreadySent = await this.hasNotificationThisRound(
      task,
      NotificationType.REVIEW_WAITING_24H,
      task.approverId,
    );

    if (alreadySent) {
      return false;
    }

    const doer = task.assignedTo?.fullName ?? 'Somebody';

    await this.notificationsService.create({
      companyId: task.companyId,
      recipientUserId: task.approverId,
      type: NotificationType.REVIEW_WAITING_24H,
      title: 'A review has been waiting a day',
      message: `${doer}'s "${task.title}" has waited a day for your review`,
      entityType: NotificationEntityType.TASK,
      entityId: task.id,
      metadata: {
        submittedForReviewAt: task.submittedForReviewAt,
        approverId: task.approverId,
        waitingHours,
      },
    });

    return true;
  }

  private async notifyAccountManagers(
    task: Task,
    waitingHours: number,
  ): Promise<boolean> {
    const managers = await this.membershipsService.findActiveMembersByRoles(
      task.companyId,
      [CompanyMembershipRole.ACCOUNT_MANAGER],
    );

    if (managers.length === 0) {
      return false;
    }

    const holder = task.approver?.fullName ?? 'nobody in particular';
    let sent = false;

    for (const manager of managers) {
      const alreadySent = await this.hasNotificationThisRound(
        task,
        NotificationType.REVIEW_WAITING_48H,
        manager.userId,
      );

      if (alreadySent) {
        continue;
      }

      await this.notificationsService.create({
        companyId: task.companyId,
        recipientUserId: manager.userId,
        type: NotificationType.REVIEW_WAITING_48H,
        title: 'A review has been waiting two days',
        message: `"${task.title}" has waited two days on ${holder}`,
        entityType: NotificationEntityType.TASK,
        entityId: task.id,
        metadata: {
          submittedForReviewAt: task.submittedForReviewAt,
          approverId: task.approverId,
          waitingHours,
        },
      });

      sent = true;
    }

    return sent;
  }

  /**
   * Has this person already been told about *this* submission?
   *
   * Matched on the submission stamp carried in the notification's own
   * metadata rather than on when the row was written: `created_at` is a naive
   * timestamp and comparing it to a JS date only agrees with itself when the
   * process happens to run in UTC.
   */
  private async hasNotificationThisRound(
    task: Task,
    type: NotificationType,
    recipientUserId: string,
  ): Promise<boolean> {
    const stamp = task.submittedForReviewAt?.toISOString();

    if (!stamp) {
      return true;
    }

    const count = await this.notificationsRepository
      .createQueryBuilder('n')
      .where('n.recipientUserId = :recipientUserId', { recipientUserId })
      .andWhere('n.type = :type', { type })
      .andWhere('n.entityId = :entityId', { entityId: task.id })
      .andWhere("n.metadata->>'submittedForReviewAt' = :stamp", { stamp })
      .getCount();

    return count > 0;
  }
}
