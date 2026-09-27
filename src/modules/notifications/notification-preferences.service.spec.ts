import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationPreferencesService } from './notification-preferences.service';

/**
 * Preferences have to answer for a user who has never opened the settings —
 * which is most users — so "no row" is a supported state, not a 404.
 */
describe('NotificationPreferencesService', () => {
  const build = (rows: Partial<NotificationPreference>[]) => {
    const saved: Partial<NotificationPreference>[] = [];

    const repository = {
      findOne: (options: { where: { userId: string } }) =>
        Promise.resolve(
          rows.find((row) => row.userId === options.where.userId) ?? null,
        ),
      find: () => Promise.resolve(rows),
      create: (row: Partial<NotificationPreference>) => row,
      save: (row: Partial<NotificationPreference>) => {
        saved.push(row);

        return Promise.resolve(row);
      },
    };

    return {
      service: new NotificationPreferencesService(repository as never),
      saved,
    };
  };

  it('gives a user with no row the defaults', async () => {
    const { service } = build([]);

    await expect(service.findForUser('nobody')).resolves.toEqual({
      mutedTypes: [],
      emailDigest: true,
    });
  });

  it('replaces the whole object rather than merging it', async () => {
    const { service, saved } = build([
      {
        userId: 'user-1',
        mutedTypes: [NotificationType.TASK_COMMENTED],
        emailDigest: true,
      },
    ]);

    const result = await service.replaceForUser('user-1', {
      mutedTypes: [NotificationType.POST_COMMENTED],
      emailDigest: false,
    });

    expect(result).toEqual({
      mutedTypes: [NotificationType.POST_COMMENTED],
      emailDigest: false,
    });
    expect(saved[0].mutedTypes).toEqual([NotificationType.POST_COMMENTED]);
  });

  it('does not store the same type twice', async () => {
    const { service, saved } = build([]);

    await service.replaceForUser('user-1', {
      mutedTypes: [
        NotificationType.TASK_COMMENTED,
        NotificationType.TASK_COMMENTED,
      ],
      emailDigest: true,
    });

    expect(saved[0].mutedTypes).toEqual([NotificationType.TASK_COMMENTED]);
  });

  it('leaves the digest out for the people who turned it off', async () => {
    const { service } = build([
      { userId: 'opted-out', mutedTypes: [], emailDigest: false },
    ]);

    const wanted = await service.findUsersWantingDigest([
      'opted-out',
      'never-saved-anything',
    ]);

    expect(wanted.has('opted-out')).toBe(false);
    // Silence is consent here: the default is on.
    expect(wanted.has('never-saved-anything')).toBe(true);
  });
});
