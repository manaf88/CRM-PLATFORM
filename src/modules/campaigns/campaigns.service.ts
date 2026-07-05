import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPostStatus } from '../content/enums/content-post-status.enum';
import { Lead } from '../leads/entities/lead.entity';
import { LeadStatus } from '../leads/enums/lead-status.enum';
import { Task } from '../tasks/entities/task.entity';
import { TaskStatus } from '../tasks/enums/task-status.enum';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { FindCampaignsQueryDto } from './dto/find-campaigns-query.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Campaign } from './entities/campaign.entity';
import { CampaignObjective } from './enums/campaign-objective.enum';
import { CampaignStatus } from './enums/campaign-status.enum';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,

    @InjectRepository(ContentPost)
    private readonly postsRepository: Repository<ContentPost>,

    @InjectRepository(Lead)
    private readonly leadsRepository: Repository<Lead>,

    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
  ) {}

  async create(
    companyId: string,
    dto: CreateCampaignDto,
    currentUser: RequestUser,
  ): Promise<Campaign> {
    this.validateDateRange(dto.startDate, dto.endDate);

    const campaign = this.campaignsRepository.create({
      companyId,
      name: dto.name.trim(),
      objective: dto.objective ?? CampaignObjective.AWARENESS,
      status: CampaignStatus.DRAFT,
      description: this.cleanOptionalString(dto.description),
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      budget: dto.budget !== undefined ? String(dto.budget) : null,
      currency: this.cleanOptionalString(dto.currency)?.toUpperCase() ?? null,
      targetAudience: this.cleanOptionalString(dto.targetAudience),
      notes: this.cleanOptionalString(dto.notes),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.campaignsRepository.save(campaign);
  }

  async findAll(companyId: string, query: FindCampaignsQueryDto) {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    const qb = this.campaignsRepository
      .createQueryBuilder('campaign')
      .where('campaign.companyId = :companyId', { companyId });

    if (query.status) {
      qb.andWhere('campaign.status = :status', {
        status: query.status,
      });
    }

    if (query.objective) {
      qb.andWhere('campaign.objective = :objective', {
        objective: query.objective,
      });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;

      qb.andWhere(
        new Brackets((innerQb) => {
          innerQb
            .where('campaign.name ILIKE :search', { search })
            .orWhere('campaign.description ILIKE :search', { search })
            .orWhere('campaign.targetAudience ILIKE :search', { search })
            .orWhere('campaign.notes ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('campaign.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async findOne(
    companyId: string,
    campaignId: string,
  ): Promise<Campaign> {
    const campaign = await this.campaignsRepository.findOne({
      where: {
        id: campaignId,
        companyId,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async update(
    companyId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
    currentUser: RequestUser,
  ): Promise<Campaign> {
    const campaign = await this.findOne(companyId, campaignId);

    const nextStartDate = dto.startDate
      ? new Date(dto.startDate)
      : campaign.startDate;

    const nextEndDate = dto.endDate
      ? new Date(dto.endDate)
      : campaign.endDate;

    this.validateDateRange(
      nextStartDate?.toISOString(),
      nextEndDate?.toISOString(),
    );

    if (dto.name !== undefined) {
      campaign.name = dto.name.trim();
    }

    if (dto.objective !== undefined) {
      campaign.objective = dto.objective;
    }

    if (dto.description !== undefined) {
      campaign.description = this.cleanOptionalString(dto.description);
    }

    if (dto.startDate !== undefined) {
      campaign.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }

    if (dto.endDate !== undefined) {
      campaign.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }

    if (dto.budget !== undefined) {
      campaign.budget = dto.budget !== null ? String(dto.budget) : null;
    }

    if (dto.currency !== undefined) {
      campaign.currency =
        this.cleanOptionalString(dto.currency)?.toUpperCase() ?? null;
    }

    if (dto.targetAudience !== undefined) {
      campaign.targetAudience = this.cleanOptionalString(dto.targetAudience);
    }

    if (dto.notes !== undefined) {
      campaign.notes = this.cleanOptionalString(dto.notes);
    }

    campaign.updatedById = currentUser.id;

    return this.campaignsRepository.save(campaign);
  }

  async updateStatus(
    companyId: string,
    campaignId: string,
    dto: UpdateCampaignStatusDto,
    currentUser: RequestUser,
  ): Promise<Campaign> {
    const campaign = await this.findOne(companyId, campaignId);

    if (campaign.status === dto.status) {
      throw new BadRequestException(
        `Campaign is already in status ${dto.status}`,
      );
    }

    campaign.status = dto.status;
    campaign.updatedById = currentUser.id;

    return this.campaignsRepository.save(campaign);
  }

  async getOverview(companyId: string, campaignId: string) {
    const campaign = await this.findOne(companyId, campaignId);

    const [
      postsTotal,
      leadsTotal,
      tasksTotal,
      postsByStatus,
      leadsByStatus,
      tasksByStatus,
    ] = await Promise.all([
      this.postsRepository.count({
        where: {
          companyId,
          campaignId,
        },
      }),
      this.leadsRepository.count({
        where: {
          companyId,
          campaignId,
        },
      }),
      this.tasksRepository.count({
        where: {
          companyId,
          campaignId,
        },
      }),
      this.countPostsByStatus(companyId, campaignId),
      this.countLeadsByStatus(companyId, campaignId),
      this.countTasksByStatus(companyId, campaignId),
    ]);

    const wonLeads = leadsByStatus[LeadStatus.WON] ?? 0;
    const conversionRate =
      leadsTotal > 0 ? Number(((wonLeads / leadsTotal) * 100).toFixed(2)) : 0;

    return {
      campaign,
      metrics: {
        posts: {
          total: postsTotal,
          byStatus: postsByStatus,
        },
        leads: {
          total: leadsTotal,
          byStatus: leadsByStatus,
          won: wonLeads,
          conversionRate,
        },
        tasks: {
          total: tasksTotal,
          byStatus: tasksByStatus,
        },
      },
    };
  }

  async attachPost(
    companyId: string,
    campaignId: string,
    postId: string,
  ): Promise<ContentPost> {
    await this.findOne(companyId, campaignId);

    const post = await this.postsRepository.findOne({
      where: {
        id: postId,
        companyId,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    post.campaignId = campaignId;

    return this.postsRepository.save(post);
  }

  async detachPost(
    companyId: string,
    campaignId: string,
    postId: string,
  ): Promise<{ success: true }> {
    const post = await this.postsRepository.findOne({
      where: {
        id: postId,
        companyId,
        campaignId,
      },
    });

    if (!post) {
      throw new NotFoundException('Campaign post link not found');
    }

    post.campaignId = null;

    await this.postsRepository.save(post);

    return { success: true };
  }

  async attachLead(
    companyId: string,
    campaignId: string,
    leadId: string,
  ): Promise<Lead> {
    await this.findOne(companyId, campaignId);

    const lead = await this.leadsRepository.findOne({
      where: {
        id: leadId,
        companyId,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    lead.campaignId = campaignId;

    return this.leadsRepository.save(lead);
  }

  async detachLead(
    companyId: string,
    campaignId: string,
    leadId: string,
  ): Promise<{ success: true }> {
    const lead = await this.leadsRepository.findOne({
      where: {
        id: leadId,
        companyId,
        campaignId,
      },
    });

    if (!lead) {
      throw new NotFoundException('Campaign lead link not found');
    }

    lead.campaignId = null;

    await this.leadsRepository.save(lead);

    return { success: true };
  }

  async attachTask(
    companyId: string,
    campaignId: string,
    taskId: string,
  ): Promise<Task> {
    await this.findOne(companyId, campaignId);

    const task = await this.tasksRepository.findOne({
      where: {
        id: taskId,
        companyId,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    task.campaignId = campaignId;

    return this.tasksRepository.save(task);
  }

  async detachTask(
    companyId: string,
    campaignId: string,
    taskId: string,
  ): Promise<{ success: true }> {
    const task = await this.tasksRepository.findOne({
      where: {
        id: taskId,
        companyId,
        campaignId,
      },
    });

    if (!task) {
      throw new NotFoundException('Campaign task link not found');
    }

    task.campaignId = null;

    await this.tasksRepository.save(task);

    return { success: true };
  }

  private async countPostsByStatus(
    companyId: string,
    campaignId: string,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const status of Object.values(ContentPostStatus)) {
      result[status] = await this.postsRepository.count({
        where: {
          companyId,
          campaignId,
          status,
        },
      });
    }

    return result;
  }

  private async countLeadsByStatus(
    companyId: string,
    campaignId: string,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const status of Object.values(LeadStatus)) {
      result[status] = await this.leadsRepository.count({
        where: {
          companyId,
          campaignId,
          status,
        },
      });
    }

    return result;
  }

  private async countTasksByStatus(
    companyId: string,
    campaignId: string,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const status of Object.values(TaskStatus)) {
      result[status] = await this.tasksRepository.count({
        where: {
          companyId,
          campaignId,
          status,
        },
      });
    }

    return result;
  }

  private validateDateRange(
    startDate?: string,
    endDate?: string,
  ): void {
    if (!startDate || !endDate) {
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'Campaign startDate must be before endDate',
      );
    }
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}