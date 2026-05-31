import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CompaniesService } from '../companies/companies.service';
import { ContentPlan } from './entities/content-plan.entity';
import { CreateContentPlanDto } from './dto/create-content-plan.dto';
import { UpdateContentPlanDto } from './dto/update-content-plan.dto';

@Injectable()
export class ContentPlansService {
  constructor(
    @InjectRepository(ContentPlan)
    private readonly contentPlansRepository: Repository<ContentPlan>,
    private readonly companiesService: CompaniesService,
  ) {}

  async create(
    companyId: string,
    dto: CreateContentPlanDto,
    currentUser: RequestUser,
  ): Promise<ContentPlan> {
    await this.companiesService.findOneById(companyId);

    const contentPlan = this.contentPlansRepository.create({
      companyId,
      title: dto.title.trim(),
      month: dto.month,
      year: dto.year,
      goal: this.cleanOptionalString(dto.goal),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.contentPlansRepository.save(contentPlan);
  }

  async findAll(companyId: string): Promise<ContentPlan[]> {
    return this.contentPlansRepository.find({
      where: { companyId },
      order: {
        year: 'DESC',
        month: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(
    companyId: string,
    contentPlanId: string,
  ): Promise<ContentPlan> {
    const contentPlan = await this.contentPlansRepository.findOne({
      where: {
        id: contentPlanId,
        companyId,
      },
    });

    if (!contentPlan) {
      throw new NotFoundException('Content plan not found');
    }

    return contentPlan;
  }

  async update(
    companyId: string,
    contentPlanId: string,
    dto: UpdateContentPlanDto,
    currentUser: RequestUser,
  ): Promise<ContentPlan> {
    const contentPlan = await this.findOne(companyId, contentPlanId);

    if (dto.title !== undefined) {
      contentPlan.title = dto.title.trim();
    }

    if (dto.month !== undefined) {
      contentPlan.month = dto.month;
    }

    if (dto.year !== undefined) {
      contentPlan.year = dto.year;
    }

    if (dto.goal !== undefined) {
      contentPlan.goal = this.cleanOptionalString(dto.goal);
    }

    if (dto.status !== undefined) {
      contentPlan.status = dto.status;
    }

    contentPlan.updatedById = currentUser.id;

    return this.contentPlansRepository.save(contentPlan);
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}