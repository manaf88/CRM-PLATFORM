import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationType } from './enums/notification-type.enum';

export type NotificationPreferences = {
  mutedTypes: NotificationType[];
  emailDigest: boolean;
};

const DEFAULTS: NotificationPreferences = {
  mutedTypes: [],
  emailDigest: true,
};

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly preferencesRepository: Repository<NotificationPreference>,
  ) {}

  /** Never 404s: a user who has saved nothing gets the defaults. */
  async findForUser(userId: string): Promise<NotificationPreferences> {
    const preference = await this.preferencesRepository.findOne({
      where: { userId },
    });

    if (!preference) {
      return { ...DEFAULTS };
    }

    return {
      mutedTypes: preference.mutedTypes ?? [],
      emailDigest: preference.emailDigest,
    };
  }

  async replaceForUser(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    const existing = await this.preferencesRepository.findOne({
      where: { userId },
    });

    const mutedTypes = [...new Set(dto.mutedTypes)];

    const preference =
      existing ??
      this.preferencesRepository.create({
        userId,
      });

    preference.mutedTypes = mutedTypes;
    preference.emailDigest = dto.emailDigest;

    const saved = await this.preferencesRepository.save(preference);

    return {
      mutedTypes: saved.mutedTypes ?? [],
      emailDigest: saved.emailDigest,
    };
  }

  async findMutedTypes(userId: string): Promise<NotificationType[]> {
    const preferences = await this.findForUser(userId);

    return preferences.mutedTypes;
  }

  /** The users among these who still want the daily email. */
  async findUsersWantingDigest(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) {
      return new Set();
    }

    const rows = await this.preferencesRepository.find({
      where: { userId: In(userIds) },
    });

    const optedOut = new Set(
      rows.filter((row) => !row.emailDigest).map((row) => row.userId),
    );

    return new Set(userIds.filter((userId) => !optedOut.has(userId)));
  }
}
