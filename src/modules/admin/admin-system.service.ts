import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { StorageService } from '../files/storage.service';

export type HealthState =
  | 'UP'
  | 'DOWN'
  | 'NOT_IN_USE'
  | 'NOT_IMPLEMENTED'
  | 'NOT_CONFIGURED'
  | 'MOCK'
  | 'CONFIGURED';

/**
 * BE-23. A service is only reported UP when something actually answered.
 * Environment variables being present proves nothing, so anything that cannot
 * be probed is reported as what it really is rather than as healthy.
 */
@Injectable()
export class AdminSystemService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async getHealth() {
    const [database, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkStorage(),
    ]);

    return {
      api: 'UP' as const,
      database,
      storage,
      // No Redis client is instantiated anywhere in the codebase. The env vars
      // exist for docker-compose; nothing connects to it.
      redis: 'NOT_IN_USE' as const,
      // No scheduler yet — this is why scheduled posts have to be published by
      // hand and show up in /attention as PUBLISHING_DUE.
      scheduler: 'NOT_IMPLEMENTED' as const,
      email: this.checkEmail(),
      ai: this.checkAi(),
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<HealthState> {
    try {
      await this.dataSource.query('SELECT 1');

      return 'UP';
    } catch {
      return 'DOWN';
    }
  }

  private async checkStorage(): Promise<HealthState> {
    try {
      return (await this.storageService.checkConnection()) ? 'UP' : 'DOWN';
    } catch {
      return 'DOWN';
    }
  }

  private checkEmail(): HealthState {
    // There is no mailer module and no SMTP configuration in this build.
    const host = this.configService.get<string>('SMTP_HOST');

    return host ? 'CONFIGURED' : 'NOT_CONFIGURED';
  }

  private checkAi(): HealthState {
    const provider = this.configService.get<string>('ai.provider', 'mock');

    if (provider === 'mock') {
      return 'MOCK';
    }

    const apiKey = this.configService.get<string>('ai.apiKey', '');

    return apiKey ? 'CONFIGURED' : 'NOT_CONFIGURED';
  }
}
