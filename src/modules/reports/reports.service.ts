import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Between,
    ObjectLiteral,
    Repository,
    SelectQueryBuilder,
} from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { Lead } from '../leads/entities/lead.entity';
import { LeadSource } from '../leads/enums/lead-source.enum';
import { LeadStatus } from '../leads/enums/lead-status.enum';
import { CreateMonthlyReportDto } from './dto/create-monthly-report.dto';
import { ReportOverviewQueryDto } from './dto/report-overview-query.dto';
import { Report } from './entities/report.entity';

type ReportDateRange = {
    startDate?: Date;
    endDate?: Date;
};

@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Report)
        private readonly reportsRepository: Repository<Report>,
        @InjectRepository(ContentPost)
        private readonly postsRepository: Repository<ContentPost>,
        @InjectRepository(Lead)
        private readonly leadsRepository: Repository<Lead>,
    ) { }
    private applyDateRangeToQueryBuilder<T extends ObjectLiteral>(
        queryBuilder: SelectQueryBuilder<T>,
        column: string,
        range: ReportDateRange,
    ): SelectQueryBuilder<T> {
        if (!range.startDate || !range.endDate) {
            return queryBuilder;
        }

        queryBuilder.andWhere(
            `${column} >= :startDate AND ${column} < :endDate`,
            {
                startDate: range.startDate,
                endDate: range.endDate,
            },
        );

        return queryBuilder;
    }
    async getOverview(
        companyId: string,
        query: ReportOverviewQueryDto,
    ) {
        const range = this.buildDateRange(query.month, query.year);

        const [postMetrics, leadMetrics] = await Promise.all([
            this.buildPostMetrics(companyId, range),
            this.buildLeadMetrics(companyId, range),
        ]);

        const summary = this.buildSummary(postMetrics, leadMetrics);
        const recommendations = this.buildRecommendations(
            postMetrics,
            leadMetrics,
        );

        return {
            period: {
                month: query.month ?? null,
                year: query.year ?? null,
            },
            summary,
            metrics: {
                posts: postMetrics,
                leads: leadMetrics,
            },
            recommendations,
        };
    }

    async createMonthlyReport(
        companyId: string,
        dto: CreateMonthlyReportDto,
        currentUser: RequestUser,
    ): Promise<Report> {
        const overview = await this.getOverview(companyId, {
            month: dto.month,
            year: dto.year,
        });

        const report = this.reportsRepository.create({
            companyId,
            month: dto.month,
            year: dto.year,
            title: `Monthly Report - ${dto.month}/${dto.year}`,
            summary: overview.summary,
            metrics: overview.metrics,
            recommendations: overview.recommendations,
            notes: this.cleanOptionalString(dto.notes),
            createdById: currentUser.id,
        });

        return this.reportsRepository.save(report);
    }

    async findAll(companyId: string): Promise<Report[]> {
        return this.reportsRepository.find({
            where: {
                companyId,
            },
            order: {
                year: 'DESC',
                month: 'DESC',
                createdAt: 'DESC',
            },
        });
    }

    async findOne(companyId: string, reportId: string): Promise<Report> {
        const report = await this.reportsRepository.findOne({
            where: {
                id: reportId,
                companyId,
            },
        });

        if (!report) {
            throw new NotFoundException('Report not found');
        }

        return report;
    }

    private async buildPostMetrics(
        companyId: string,
        range: ReportDateRange,
    ) {
        const where = this.buildWhere(companyId, range);

        const total = await this.postsRepository.count({ where });

        const byStatus: Record<string, number> = {};
        const byPlatform: Record<string, number> = {};
        const byContentType: Record<string, number> = {};

        for (const status of Object.values(ContentPostStatus)) {
            byStatus[status] = await this.postsRepository.count({
                where: {
                    ...where,
                    status,
                },
            });
        }

        const platformQuery = this.postsRepository
            .createQueryBuilder('post')
            .select('post.platform', 'platform')
            .addSelect('COUNT(*)', 'count')
            .where('post.companyId = :companyId', { companyId });

        this.applyDateRangeToQueryBuilder(
            platformQuery,
            'post.createdAt',
            range,
        );

        const rawPlatformCounts = await platformQuery
            .groupBy('post.platform')
            .getRawMany<{ platform: string; count: string }>();

        for (const row of rawPlatformCounts) {
            byPlatform[row.platform] = Number(row.count);
        }

        const contentTypeQuery = this.postsRepository
            .createQueryBuilder('post')
            .select('post.contentType', 'contentType')
            .addSelect('COUNT(*)', 'count')
            .where('post.companyId = :companyId', { companyId });

        this.applyDateRangeToQueryBuilder(
            contentTypeQuery,
            'post.createdAt',
            range,
        );

        const rawContentTypeCounts = await contentTypeQuery
            .groupBy('post.contentType')
            .getRawMany<{ contentType: string; count: string }>();

        for (const row of rawContentTypeCounts) {
            byContentType[row.contentType] = Number(row.count);
        }

        return {
            total,
            byStatus,
            byPlatform,
            byContentType,
            approved: byStatus[ContentPostStatus.APPROVED] ?? 0,
            published: byStatus[ContentPostStatus.PUBLISHED] ?? 0,
            readyForClient:
                byStatus[ContentPostStatus.READY_FOR_CLIENT] ?? 0,
            changesRequested:
                byStatus[ContentPostStatus.CHANGES_REQUESTED] ?? 0,
        };
    }

    private async buildLeadMetrics(
        companyId: string,
        range: ReportDateRange,
    ) {
        const where = this.buildWhere(companyId, range);

        const total = await this.leadsRepository.count({ where });

        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};

        for (const status of Object.values(LeadStatus)) {
            byStatus[status] = await this.leadsRepository.count({
                where: {
                    ...where,
                    status,
                },
            });
        }

        for (const source of Object.values(LeadSource)) {
            bySource[source] = await this.leadsRepository.count({
                where: {
                    ...where,
                    source,
                },
            });
        }

        const won = byStatus[LeadStatus.WON] ?? 0;
        const lost = byStatus[LeadStatus.LOST] ?? 0;
        const conversionRate =
            total > 0 ? Number(((won / total) * 100).toFixed(2)) : 0;

        return {
            total,
            byStatus,
            bySource,
            won,
            lost,
            conversionRate,
            activePipeline:
                total -
                won -
                lost,
        };
    }

    private buildSummary(
        postMetrics: Awaited<ReturnType<typeof this.buildPostMetrics>>,
        leadMetrics: Awaited<ReturnType<typeof this.buildLeadMetrics>>,
    ): string {
        return [
            `This period includes ${postMetrics.total} content posts and ${leadMetrics.total} leads.`,
            `${postMetrics.published} posts were published and ${postMetrics.approved} posts were approved.`,
            `${leadMetrics.won} leads were won, with a conversion rate of ${leadMetrics.conversionRate}%.`,
        ].join(' ');
    }

    private buildRecommendations(
        postMetrics: Awaited<ReturnType<typeof this.buildPostMetrics>>,
        leadMetrics: Awaited<ReturnType<typeof this.buildLeadMetrics>>,
    ): string[] {
        const recommendations: string[] = [];

        if (postMetrics.total === 0) {
            recommendations.push(
                'Create a consistent monthly content plan to maintain visibility.',
            );
        }

        if (postMetrics.changesRequested > 0) {
            recommendations.push(
                'Review recurring client feedback to reduce content revision cycles.',
            );
        }

        if (leadMetrics.total === 0) {
            recommendations.push(
                'Start tracking social media inquiries as leads to measure business impact.',
            );
        }

        if (leadMetrics.total > 0 && leadMetrics.conversionRate < 15) {
            recommendations.push(
                'Improve follow-up speed and add clearer CTAs to increase lead conversion.',
            );
        }

        if (leadMetrics.bySource[LeadSource.INSTAGRAM] > 0) {
            recommendations.push(
                'Instagram is generating leads; continue testing educational and offer-based content.',
            );
        }

        if (recommendations.length === 0) {
            recommendations.push(
                'Performance is stable. Continue monitoring content output, lead sources, and conversion quality.',
            );
        }

        return recommendations;
    }

    private buildWhere(companyId: string, range: ReportDateRange) {
        if (range.startDate && range.endDate) {
            return {
                companyId,
                createdAt: Between(range.startDate, range.endDate),
            };
        }

        return {
            companyId,
        };
    }

    private buildDateRange(
        month?: number,
        year?: number,
    ): ReportDateRange {
        if (!month || !year) {
            return {};
        }

        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));

        return {
            startDate,
            endDate,
        };
    }



    private cleanOptionalString(value?: string): string | null {
        if (value === undefined) {
            return null;
        }

        const cleaned = value.trim();

        return cleaned.length > 0 ? cleaned : null;
    }
}