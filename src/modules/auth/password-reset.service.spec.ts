import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { PasswordResetService } from './password-reset.service';

/**
 * Two things matter here and neither is the happy path: the endpoint must not
 * tell a stranger whether an address has an account, and a link must stop
 * working the moment it is used or expires.
 */
describe('PasswordResetService', () => {
  const hash = (token: string) =>
    createHash('sha256').update(token).digest('hex');

  const build = (options: {
    user?: Partial<User> | null;
    stored?: Partial<PasswordResetToken> | null;
  }) => {
    const saved: Partial<PasswordResetToken>[] = [];
    const deleted: unknown[] = [];
    const sent: { to: string; text: string }[] = [];
    const passwords: { userId: string; password: string }[] = [];

    const tokensRepository = {
      findOne: () => Promise.resolve(options.stored ?? null),
      create: (row: Partial<PasswordResetToken>) => row,
      save: (row: Partial<PasswordResetToken>) => {
        saved.push(row);

        return Promise.resolve(row);
      },
      delete: (criteria: unknown) => {
        deleted.push(criteria);

        return Promise.resolve({ affected: 1 });
      },
    };

    const usersService = {
      findByEmail: () => Promise.resolve(options.user ?? null),
      findActiveById: () => Promise.resolve(options.user ?? null),
      replacePassword: (userId: string, password: string) => {
        passwords.push({ userId, password });

        return Promise.resolve();
      },
    };

    const mailService = {
      send: (message: { to: string; text: string }) => {
        sent.push(message);

        return Promise.resolve(true);
      },
    };

    const configService = {
      get: () => 'https://app.example.com',
    };

    const service = new PasswordResetService(
      tokensRepository as never,
      usersService as unknown as UsersService,
      mailService as unknown as MailService,
      configService as unknown as ConfigService,
    );

    return { service, saved, deleted, sent, passwords };
  };

  const ACTIVE_USER: Partial<User> = {
    id: 'user-1',
    email: 'jessika@agency.com',
    fullName: 'Jessika',
    status: UserStatus.ACTIVE,
  };

  describe('requesting a reset', () => {
    it('emails a link and stores only its hash', async () => {
      const { service, saved, sent } = build({ user: ACTIVE_USER });

      await service.requestReset({ email: 'jessika@agency.com' });

      expect(sent).toHaveLength(1);

      const link = sent[0].text.match(/token=([\w-]+)/);
      const token = link?.[1] as string;

      expect(token.length).toBeGreaterThan(20);
      expect(saved[0].tokenHash).toBe(hash(token));
      // The plain token is never written down anywhere.
      expect(saved[0].tokenHash).not.toContain(token);
    });

    it('answers the same for an address with no account', async () => {
      const { service, sent } = build({ user: null });

      await expect(
        service.requestReset({ email: 'stranger@example.com' }),
      ).resolves.toEqual({ success: true });

      expect(sent).toHaveLength(0);
    });

    it('says nothing about a deactivated account either', async () => {
      const { service, sent } = build({
        user: { ...ACTIVE_USER, status: UserStatus.INACTIVE },
      });

      await expect(
        service.requestReset({ email: 'jessika@agency.com' }),
      ).resolves.toEqual({ success: true });

      expect(sent).toHaveLength(0);
    });

    it('invalidates any earlier link for that person', async () => {
      const { service, deleted } = build({ user: ACTIVE_USER });

      await service.requestReset({ email: 'jessika@agency.com' });

      expect(deleted).toEqual([{ userId: 'user-1' }]);
    });
  });

  describe('using a reset link', () => {
    const future = () => new Date(Date.now() + 60 * 60 * 1000);

    it('sets the new password and burns the token', async () => {
      const { service, saved, passwords } = build({
        user: ACTIVE_USER,
        stored: {
          id: 'token-1',
          userId: 'user-1',
          expiresAt: future(),
          usedAt: null,
        },
      });

      await service.resetPassword({
        token: 'a'.repeat(32),
        password: 'a-long-enough-password',
      });

      expect(passwords).toEqual([
        { userId: 'user-1', password: 'a-long-enough-password' },
      ]);
      expect(saved[0].usedAt).toBeInstanceOf(Date);
    });

    it('refuses a token that has already been used', async () => {
      const { service } = build({
        user: ACTIVE_USER,
        stored: {
          userId: 'user-1',
          expiresAt: future(),
          usedAt: new Date(),
        },
      });

      await expect(
        service.resetPassword({
          token: 'a'.repeat(32),
          password: 'a-long-enough-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a token that has expired', async () => {
      const { service } = build({
        user: ACTIVE_USER,
        stored: {
          userId: 'user-1',
          expiresAt: new Date(Date.now() - 1000),
          usedAt: null,
        },
      });

      await expect(
        service.resetPassword({
          token: 'a'.repeat(32),
          password: 'a-long-enough-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a token nobody issued', async () => {
      const { service } = build({ user: ACTIVE_USER, stored: null });

      await expect(
        service.resetPassword({
          token: 'a'.repeat(32),
          password: 'a-long-enough-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
