import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CompaniesService } from '../companies/companies.service';
import { ContentPost } from './entities/content-post.entity';
import { ContentPlan } from './entities/content-plan.entity';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { FindContentPostsQueryDto } from './dto/find-content-posts-query.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';

@Injectable()
export class ContentPostsService {
  constructor(
    @InjectRepository(ContentPost)
    private readonly contentPostsRepository: Repository<ContentPost>,
    @InjectRepository(ContentPlan)
    private readonly contentPlansRepository: Repository<ContentPlan>,
    private readonly companiesService: CompaniesService,
  ) {}

  async create(
    companyId: string,
    dto: CreateContentPostDto,
    currentUser: RequestUser,
  ): Promise<ContentPost> {
    await this.companiesService.findOneById(companyId);

    if (dto.contentPlanId) {
      await this.ensureContentPlanBelongsToCompany(
        companyId,
        dto.contentPlanId,
      );
    }

    const post = this.contentPostsRepository.create({
      companyId,
      contentPlanId: dto.contentPlanId ?? null,
      title: dto.title.trim(),
      contentType: dto.contentType,
      platform: dto.platform,
      caption: this.cleanOptionalString(dto.caption),
      visualBrief: this.cleanOptionalString(dto.visualBrief),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      publishedUrl: this.cleanOptionalString(dto.publishedUrl),
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.contentPostsRepository.save(post);
  }

  async findAll(
    companyId: string,
    query: FindContentPostsQueryDto,
  ): Promise<ContentPost[]> {
    const where: FindOptionsWhere<ContentPost> = {
      companyId,
    };

    if (query.contentPlanId) {
      where.contentPlanId = query.contentPlanId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.platform) {
      where.platform = query.platform;
    }

    if (query.contentType) {
      where.contentType = query.contentType;
    }

    return this.contentPostsRepository.find({
      where,
      order: {
        scheduledAt: 'ASC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(
    companyId: string,
    postId: string,
  ): Promise<ContentPost> {
    const post = await this.contentPostsRepository.findOne({
      where: {
        id: postId,
        companyId,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async update(
    companyId: string,
    postId: string,
    dto: UpdateContentPostDto,
    currentUser: RequestUser,
  ): Promise<ContentPost> {
    const post = await this.findOne(companyId, postId);

    if (dto.contentPlanId !== undefined) {
      if (dto.contentPlanId) {
        await this.ensureContentPlanBelongsToCompany(
          companyId,
          dto.contentPlanId,
        );
      }

      post.contentPlanId = dto.contentPlanId ?? null;
    }

    if (dto.title !== undefined) {
      post.title = dto.title.trim();
    }

    if (dto.contentType !== undefined) {
      post.contentType = dto.contentType;
    }

    if (dto.platform !== undefined) {
      post.platform = dto.platform;
    }

    if (dto.caption !== undefined) {
      post.caption = this.cleanOptionalString(dto.caption);
    }

    if (dto.visualBrief !== undefined) {
      post.visualBrief = this.cleanOptionalString(dto.visualBrief);
    }

    if (dto.scheduledAt !== undefined) {
      post.scheduledAt = dto.scheduledAt
        ? new Date(dto.scheduledAt)
        : null;
    }

    if (dto.publishedUrl !== undefined) {
      post.publishedUrl = this.cleanOptionalString(dto.publishedUrl);
    }

    if (dto.status !== undefined) {
      post.status = dto.status;
    }

    post.updatedById = currentUser.id;

    return this.contentPostsRepository.save(post);
  }

  private async ensureContentPlanBelongsToCompany(
    companyId: string,
    contentPlanId: string,
  ): Promise<void> {
    const contentPlan = await this.contentPlansRepository.findOne({
      where: {
        id: contentPlanId,
        companyId,
      },
    });

    if (!contentPlan) {
      throw new BadRequestException(
        'Content plan does not belong to this company',
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