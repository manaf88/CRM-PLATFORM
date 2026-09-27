import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';
import { NotificationPreferencesService } from './notification-preferences.service';
import { Notification } from './entities/notification.entity';
import { NotificationEntityType } from './enums/notification-entity-type.enum';
import { NotificationReadStatus } from './enums/notification-read-status.enum';
import { NotificationType } from './enums/notification-type.enum';

type CreateNotificationInput = {
  companyId?: string | null;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,

    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    if (!input.recipientUserId) {
      throw new Error('recipientUserId is required');
    }

    const notification = this.notificationsRepository.create({
      companyId: input.companyId ?? null,
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      readAt: null,
    });

    return this.notificationsRepository.save(notification);
  }

  async createMany(inputs: CreateNotificationInput[]): Promise<Notification[]> {
    const validInputs = inputs.filter((input) => input.recipientUserId);

    if (validInputs.length === 0) {
      return [];
    }

    const notifications = validInputs.map((input) =>
      this.notificationsRepository.create({
        companyId: input.companyId ?? null,
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? {},
        readAt: null,
      }),
    );

    return this.notificationsRepository.save(notifications);
  }

  async findMine(currentUser: RequestUser, query: FindNotificationsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = {
      recipientUserId: currentUser.id,
    };

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    // A muted type is still stored — the person can go and look for it — but
    // it does not reach the bell unless they ask for it.
    const mutedTypes = query.includeMuted
      ? []
      : await this.preferencesService.findMutedTypes(currentUser.id);

    if (query.type) {
      if (mutedTypes.includes(query.type)) {
        return { items: [], total: 0, limit, offset };
      }

      where.type = query.type;
    } else if (mutedTypes.length > 0) {
      where.type = Not(In(mutedTypes));
    }

    if (query.readStatus === NotificationReadStatus.READ) {
      where.readAt = Not(IsNull());
    }

    if (query.readStatus === NotificationReadStatus.UNREAD) {
      where.readAt = IsNull();
    }

    const [items, total] = await this.notificationsRepository.findAndCount({
      where,
      order: {
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async getUnreadCount(currentUser: RequestUser) {
    const mutedTypes = await this.preferencesService.findMutedTypes(
      currentUser.id,
    );

    const where: Record<string, unknown> = {
      recipientUserId: currentUser.id,
      readAt: IsNull(),
    };

    if (mutedTypes.length > 0) {
      where.type = Not(In(mutedTypes));
    }

    const count = await this.notificationsRepository.count({
      where,
    });

    return {
      unreadCount: count,
    };
  }

  async markAsRead(
    currentUser: RequestUser,
    notificationId: string,
  ): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: {
        id: notificationId,
        recipientUserId: currentUser.id,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationsRepository.save(notification);
    }

    return notification;
  }

  async markAllAsRead(currentUser: RequestUser): Promise<{ updated: number }> {
    const result = await this.notificationsRepository.update(
      {
        recipientUserId: currentUser.id,
        readAt: IsNull(),
      },
      {
        readAt: new Date(),
      },
    );

    return {
      updated: result.affected ?? 0,
    };
  }
}
