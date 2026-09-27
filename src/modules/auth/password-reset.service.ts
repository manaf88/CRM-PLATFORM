import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { LessThan, Repository } from 'typeorm';

import { MailService } from '../mail/mail.service';
import { UserStatus } from '../users/enums/user-status.enum';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';

const TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokensRepository: Repository<PasswordResetToken>,

    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Always answers the same way.
   *
   * Whether the address has an account is not something an unauthenticated
   * caller gets to learn — a different response for "no such user" turns this
   * endpoint into a way to enumerate who works here.
   */
  async requestReset(dto: ForgotPasswordDto): Promise<{ success: true }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user || user.status !== UserStatus.ACTIVE) {
      return { success: true };
    }

    // Asking again invalidates the previous link, so a forwarded old email
    // cannot be used after a second request.
    await this.tokensRepository.delete({ userId: user.id });

    const token = randomBytes(32).toString('base64url');

    await this.tokensRepository.save(
      this.tokensRepository.create({
        userId: user.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        usedAt: null,
      }),
    );

    const link = `${this.frontendBaseUrl()}/forgot-password?token=${token}`;

    await this.mailService.send({
      to: user.email,
      subject: 'Reset your Solutions Platform password',
      text: [
        `Hello ${user.fullName},`,
        '',
        'Somebody asked to reset the password for this account. Open the link below within one hour to choose a new one:',
        link,
        '',
        'If that was not you, ignore this email — your password stays as it is.',
      ].join('\n'),
    });

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    const record = await this.tokensRepository.findOne({
      where: { tokenHash: this.hashToken(dto.token) },
    });

    // One message for every failure: expired, already used, or never existed.
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This reset link is no longer valid. Ask for a new one.',
      );
    }

    const user = await this.usersService.findActiveById(record.userId);

    if (!user) {
      throw new BadRequestException(
        'This reset link is no longer valid. Ask for a new one.',
      );
    }

    await this.usersService.replacePassword(user.id, dto.password);

    record.usedAt = new Date();
    await this.tokensRepository.save(record);

    this.logger.log(`Password reset completed for user ${user.id}`);

    return { success: true };
  }

  /** Housekeeping: expired links are of no use to anybody. */
  async deleteExpiredTokens(): Promise<number> {
    const result = await this.tokensRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    return result.affected ?? 0;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * FRONTEND_URL may hold several comma-separated origins for CORS; links go
   * to the first one.
   */
  private frontendBaseUrl(): string {
    const configured =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:5173';

    return configured.split(',')[0].trim().replace(/\/+$/, '');
  }
}
