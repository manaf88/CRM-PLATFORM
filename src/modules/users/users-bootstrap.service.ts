import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as argon2 from 'argon2';

import { PlatformRole } from './enums/platform-role.enum';
import { UsersService } from './users.service';

/**
 * Seeds the first administrator from the environment.
 *
 * Accounts are created by administrators only, so a brand new database would
 * otherwise have nobody able to sign in and nobody able to create anyone.
 *
 * Idempotent: it creates the account when missing, and promotes it if it exists
 * without administrator rights. An existing password is never overwritten.
 */
@Injectable()
export class UsersBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.configService.get<string | null>(
      'auth.bootstrapAdminEmail',
    );
    const password = this.configService.get<string | null>(
      'auth.bootstrapAdminPassword',
    );

    if (!email || !password) {
      this.logger.warn(
        'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are not set — no administrator will be created',
      );
      return;
    }

    try {
      const existingUser = await this.usersService.findByEmail(email);

      if (existingUser) {
        if (existingUser.platformRole !== PlatformRole.SUPER_ADMIN) {
          await this.usersService.updateEmployee(existingUser.id, {
            platformRole: PlatformRole.SUPER_ADMIN,
          });

          this.logger.log(`Promoted ${email} to SUPER_ADMIN`);
        }

        return;
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      const admin = await this.usersService.create({
        email,
        fullName: this.configService.get<string>('auth.bootstrapAdminName') ??
          'Solutions Admin',
        passwordHash,
        platformRole: PlatformRole.SUPER_ADMIN,
      });

      this.logger.log(`Created the first administrator: ${admin.email}`);
    } catch (error) {
      // Never block startup on seeding.
      this.logger.error(
        `Could not seed the administrator account: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
