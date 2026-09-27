import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { Company } from '../companies/entities/company.entity';
import { ReportShareToken } from './entities/report-share-token.entity';
import { Report } from './entities/report.entity';

const SHARE_TTL_DAYS = 90;

export type ShareResult = {
  /**
   * The link. Present only when a token was just minted: the stored value is
   * a hash, so an existing link cannot be shown a second time.
   */
  url: string | null;
  created: boolean;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * Public links to a report, for the people a client forwards it to.
 *
 * The ticket asked for two things that cannot both hold — store the token
 * hashed, and have a repeat POST hand back the same link. Hashing wins: a
 * repeat POST reports that a link already exists and returns no URL, and
 * `rotate` mints a fresh one and revokes the old. Nothing silently breaks a
 * link a client has already been sent.
 */
@Injectable()
export class ReportSharesService {
  private readonly logger = new Logger(ReportSharesService.name);

  constructor(
    @InjectRepository(ReportShareToken)
    private readonly sharesRepository: Repository<ReportShareToken>,

    @InjectRepository(Report)
    private readonly reportsRepository: Repository<Report>,

    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,

    private readonly configService: ConfigService,
  ) {}

  async share(
    companyId: string,
    reportId: string,
    currentUser: RequestUser,
    rotate = false,
  ): Promise<ShareResult> {
    const report = await this.findReport(companyId, reportId);

    const active = await this.findActiveShare(report.id);

    if (active && !rotate) {
      return {
        url: null,
        created: false,
        expiresAt: active.expiresAt,
        createdAt: active.createdAt,
      };
    }

    if (active) {
      active.revokedAt = new Date();
      active.revokedById = currentUser.id;
      await this.sharesRepository.save(active);

      this.logger.log(
        `REPORT_SHARE_REVOKED report=${report.id} by=${currentUser.id} reason=rotated`,
      );
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const saved = await this.sharesRepository.save(
      this.sharesRepository.create({
        companyId,
        reportId: report.id,
        tokenHash: this.hashToken(token),
        expiresAt,
        createdById: currentUser.id,
      }),
    );

    this.logger.log(
      `REPORT_SHARED report=${report.id} by=${currentUser.id} expires=${expiresAt.toISOString()}`,
    );

    return {
      url: `${this.frontendBaseUrl()}/r/${token}`,
      created: true,
      expiresAt: saved.expiresAt,
      createdAt: saved.createdAt,
    };
  }

  /** Whether a link is out there, without being able to show it. */
  async findShare(companyId: string, reportId: string) {
    const report = await this.findReport(companyId, reportId);
    const active = await this.findActiveShare(report.id);

    if (!active) {
      return { active: false as const };
    }

    return {
      active: true as const,
      expiresAt: active.expiresAt,
      createdAt: active.createdAt,
      createdById: active.createdById,
      lastViewedAt: active.lastViewedAt,
      viewCount: active.viewCount,
    };
  }

  async revoke(
    companyId: string,
    reportId: string,
    currentUser: RequestUser,
  ): Promise<void> {
    const report = await this.findReport(companyId, reportId);
    const active = await this.findActiveShare(report.id);

    if (!active) {
      return;
    }

    active.revokedAt = new Date();
    active.revokedById = currentUser.id;
    await this.sharesRepository.save(active);

    this.logger.log(
      `REPORT_SHARE_REVOKED report=${report.id} by=${currentUser.id}`,
    );
  }

  /**
   * The public read. A token that is wrong, revoked or expired is a 404 —
   * never a 403, which would confirm that the report exists.
   */
  async findPublicReport(token: string) {
    const share = await this.sharesRepository.findOne({
      where: {
        tokenHash: this.hashToken(token),
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!share) {
      throw new NotFoundException('Report not found');
    }

    const [report, company] = await Promise.all([
      this.reportsRepository.findOne({ where: { id: share.reportId } }),
      this.companiesRepository.findOne({ where: { id: share.companyId } }),
    ]);

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.sharesRepository.update(
      { id: share.id },
      {
        lastViewedAt: new Date(),
        viewCount: share.viewCount + 1,
      },
    );

    // Everything the report says to the client, and nothing about who wrote
    // it or what the agency wrote to itself in the notes.
    return {
      id: report.id,
      companyId: report.companyId,
      company: { name: company?.name ?? null },
      month: report.month,
      year: report.year,
      title: report.title,
      summary: report.summary,
      metrics: report.metrics,
      recommendations: report.recommendations,
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      sharedUntil: share.expiresAt,
    };
  }

  private async findReport(
    companyId: string,
    reportId: string,
  ): Promise<Report> {
    const report = await this.reportsRepository.findOne({
      where: { id: reportId, companyId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return report;
  }

  private findActiveShare(reportId: string) {
    return this.sharesRepository.findOne({
      where: {
        reportId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private frontendBaseUrl(): string {
    const configured =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:5173';

    return configured.split(',')[0].trim().replace(/\/+$/, '');
  }
}
