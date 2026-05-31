import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { ContentPost } from '../content/entities/content-post.entity';
import { ContentPlan } from '../content/entities/content-plan.entity';
import { ContentPlatform } from '../content/enums/content-platform.enum';
import { ContentType } from '../content/enums/content-type.enum';
import { ApplyCaptionGenerationDto } from './dto/apply-caption-generation.dto';
import { ApplyContentPlanGenerationDto } from './dto/apply-content-plan-generation.dto';
import { ApplyPostIdeaGenerationDto } from './dto/apply-post-idea-generation.dto';
import { AiGenerationApplication } from './entities/ai-generation-application.entity';
import { AiGeneration } from './entities/ai-generation.entity';
import { AiGenerationApplicationType } from './enums/ai-generation-application-type.enum';
import { AiGenerationStatus } from './enums/ai-generation-status.enum';
import { AiGenerationType } from './enums/ai-generation-type.enum';

type ContentPlanOutputPost = {
  title: string;
  contentType: ContentType;
  platform: ContentPlatform;
  caption: string | null;
  visualBrief: string | null;
  suggestedDate: string | null;
};

type ContentPlanOutput = {
  title: string;
  summary: string | null;
  posts: ContentPlanOutputPost[];
};

type PostIdeaOutput = {
  title: string;
  contentType: ContentType;
  platform: ContentPlatform;
  angle: string | null;
};

@Injectable()
export class AiApplyService {
  constructor(private readonly dataSource: DataSource) {}

  async applyContentPlanGeneration(
    companyId: string,
    generationId: string,
    dto: ApplyContentPlanGenerationDto,
    currentUser: RequestUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const generation = await this.getGenerationForUpdate(
        manager,
        companyId,
        generationId,
      );

      this.ensureGenerationCanBeApplied(
        generation,
        AiGenerationType.CONTENT_PLAN_PREVIEW,
      );

      await this.ensureContentPlanGenerationNotApplied(
        manager,
        companyId,
        generation.id,
      );

      const output = this.parseContentPlanOutput(generation.output);
      const inputDto = this.getGenerationInputDto(generation);

      const month = this.getRequiredNumber(inputDto, 'month');
      const year = this.getRequiredNumber(inputDto, 'year');
      const goal = this.getOptionalString(inputDto.goal);

      const contentPlanRepository = manager.getRepository(ContentPlan);
      const contentPostRepository = manager.getRepository(ContentPost);
      const applicationRepository =
        manager.getRepository(AiGenerationApplication);

      const contentPlan = contentPlanRepository.create({
        companyId,
        title:
          this.cleanOptionalString(dto.titleOverride) ??
          output.title ??
          `AI Content Plan ${month}/${year}`,
        month,
        year,
        goal: goal ?? output.summary,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      });

      const savedContentPlan =
        await contentPlanRepository.save(contentPlan);

      const shouldCreatePosts = dto.createPosts ?? true;
      const savedPosts: ContentPost[] = [];

      if (shouldCreatePosts) {
        for (const outputPost of output.posts) {
          const post = contentPostRepository.create({
            companyId,
            contentPlanId: savedContentPlan.id,
            title: outputPost.title,
            contentType: outputPost.contentType,
            platform: outputPost.platform,
            caption: outputPost.caption,
            visualBrief: outputPost.visualBrief,
            scheduledAt: this.parseSuggestedDate(
              outputPost.suggestedDate,
            ),
            createdById: currentUser.id,
            updatedById: currentUser.id,
          });

          savedPosts.push(await contentPostRepository.save(post));
        }
      }

      const application = applicationRepository.create({
        companyId,
        generationId: generation.id,
        appliedById: currentUser.id,
        applicationType:
          AiGenerationApplicationType.CONTENT_PLAN_CREATED,
        sourceIndex: null,
        entityType: 'CONTENT_PLAN',
        entityId: savedContentPlan.id,
        metadata: {
          postsCreated: savedPosts.length,
        },
      });

      const savedApplication =
        await applicationRepository.save(application);

      return {
        contentPlan: savedContentPlan,
        posts: savedPosts,
        application: savedApplication,
      };
    });
  }

  async applyCaptionGeneration(
    companyId: string,
    generationId: string,
    dto: ApplyCaptionGenerationDto,
    currentUser: RequestUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const generation = await this.getGenerationForUpdate(
        manager,
        companyId,
        generationId,
      );

      this.ensureGenerationCanBeApplied(
        generation,
        AiGenerationType.CAPTION_SUGGESTION,
      );

      const captions = this.parseCaptionOutput(generation.output);
      const selectedCaption = captions[dto.captionIndex];

      if (!selectedCaption) {
        throw new BadRequestException('Caption index is out of range');
      }

      const postRepository = manager.getRepository(ContentPost);
      const applicationRepository =
        manager.getRepository(AiGenerationApplication);

      const post = await postRepository.findOne({
        where: {
          id: dto.postId,
          companyId,
        },
      });

      if (!post) {
        throw new NotFoundException('Post not found');
      }

      post.caption = selectedCaption;
      post.updatedById = currentUser.id;

      const savedPost = await postRepository.save(post);

      const application = applicationRepository.create({
        companyId,
        generationId: generation.id,
        appliedById: currentUser.id,
        applicationType: AiGenerationApplicationType.CAPTION_APPLIED,
        sourceIndex: dto.captionIndex,
        entityType: 'POST',
        entityId: savedPost.id,
        metadata: {
          caption: selectedCaption,
        },
      });

      const savedApplication =
        await applicationRepository.save(application);

      return {
        post: savedPost,
        appliedCaption: selectedCaption,
        application: savedApplication,
      };
    });
  }

  async applyPostIdeaGeneration(
    companyId: string,
    generationId: string,
    dto: ApplyPostIdeaGenerationDto,
    currentUser: RequestUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const generation = await this.getGenerationForUpdate(
        manager,
        companyId,
        generationId,
      );

      this.ensureGenerationCanBeApplied(
        generation,
        AiGenerationType.POST_IDEAS,
      );

      const ideas = this.parsePostIdeasOutput(generation.output);
      const selectedIdea = ideas[dto.ideaIndex];

      if (!selectedIdea) {
        throw new BadRequestException('Idea index is out of range');
      }

      if (dto.contentPlanId) {
        await this.ensureContentPlanBelongsToCompany(
          manager,
          companyId,
          dto.contentPlanId,
        );
      }

      const postRepository = manager.getRepository(ContentPost);
      const applicationRepository =
        manager.getRepository(AiGenerationApplication);

      const post = postRepository.create({
        companyId,
        contentPlanId: dto.contentPlanId ?? null,
        title: selectedIdea.title,
        contentType: selectedIdea.contentType,
        platform: selectedIdea.platform,
        caption: null,
        visualBrief: selectedIdea.angle,
        scheduledAt: dto.scheduledAt
          ? new Date(dto.scheduledAt)
          : null,
        createdById: currentUser.id,
        updatedById: currentUser.id,
      });

      const savedPost = await postRepository.save(post);

      const application = applicationRepository.create({
        companyId,
        generationId: generation.id,
        appliedById: currentUser.id,
        applicationType:
          AiGenerationApplicationType.POST_IDEA_CREATED,
        sourceIndex: dto.ideaIndex,
        entityType: 'POST',
        entityId: savedPost.id,
        metadata: {
          idea: selectedIdea,
        },
      });

      const savedApplication =
        await applicationRepository.save(application);

      return {
        post: savedPost,
        application: savedApplication,
      };
    });
  }

  private async getGenerationForUpdate(
    manager: EntityManager,
    companyId: string,
    generationId: string,
  ): Promise<AiGeneration> {
    const generationRepository = manager.getRepository(AiGeneration);

    const generation = await generationRepository.findOne({
      where: {
        id: generationId,
        companyId,
      },
    });

    if (!generation) {
      throw new NotFoundException('AI generation not found');
    }

    return generation;
  }

  private ensureGenerationCanBeApplied(
    generation: AiGeneration,
    expectedType: AiGenerationType,
  ): void {
    if (generation.status !== AiGenerationStatus.SUCCEEDED) {
      throw new BadRequestException(
        'Only succeeded AI generations can be applied',
      );
    }

    if (generation.type !== expectedType) {
      throw new BadRequestException(
        `This AI generation cannot be applied as ${expectedType}`,
      );
    }

    if (!generation.output) {
      throw new BadRequestException('AI generation has no output');
    }
  }

  private async ensureContentPlanGenerationNotApplied(
    manager: EntityManager,
    companyId: string,
    generationId: string,
  ): Promise<void> {
    const applicationRepository =
      manager.getRepository(AiGenerationApplication);

    const existingApplication = await applicationRepository.findOne({
      where: {
        companyId,
        generationId,
        applicationType:
          AiGenerationApplicationType.CONTENT_PLAN_CREATED,
      },
    });

    if (existingApplication) {
      throw new ConflictException(
        'This content plan generation was already applied',
      );
    }
  }

  private async ensureContentPlanBelongsToCompany(
    manager: EntityManager,
    companyId: string,
    contentPlanId: string,
  ): Promise<void> {
    const contentPlanRepository = manager.getRepository(ContentPlan);

    const contentPlan = await contentPlanRepository.findOne({
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

  private parseContentPlanOutput(
    output: Record<string, unknown> | null,
  ): ContentPlanOutput {
    if (!this.isRecord(output)) {
      throw new BadRequestException('Invalid AI output');
    }

    const title = this.getRequiredString(output, 'title');
    const summary = this.getOptionalString(output.summary);
    const rawPosts = output.posts;

    if (!Array.isArray(rawPosts)) {
      throw new BadRequestException(
        'AI content plan output must include posts array',
      );
    }

    const posts = rawPosts.map((rawPost) => {
      if (!this.isRecord(rawPost)) {
        throw new BadRequestException('Invalid post item in AI output');
      }

      return {
        title: this.getRequiredString(rawPost, 'title'),
        contentType: this.parseContentType(rawPost.contentType),
        platform: this.parsePlatform(rawPost.platform),
        caption: this.getOptionalString(rawPost.caption),
        visualBrief: this.getOptionalString(rawPost.visualBrief),
        suggestedDate: this.getOptionalString(rawPost.suggestedDate),
      };
    });

    return {
      title,
      summary,
      posts,
    };
  }

  private parseCaptionOutput(
    output: Record<string, unknown> | null,
  ): string[] {
    if (!this.isRecord(output) || !Array.isArray(output.captions)) {
      throw new BadRequestException(
        'AI caption output must include captions array',
      );
    }

    return output.captions
      .filter((caption): caption is string => typeof caption === 'string')
      .map((caption) => caption.trim())
      .filter((caption) => caption.length > 0);
  }

  private parsePostIdeasOutput(
    output: Record<string, unknown> | null,
  ): PostIdeaOutput[] {
    if (!this.isRecord(output) || !Array.isArray(output.ideas)) {
      throw new BadRequestException(
        'AI post ideas output must include ideas array',
      );
    }

    return output.ideas.map((rawIdea) => {
      if (!this.isRecord(rawIdea)) {
        throw new BadRequestException('Invalid idea item in AI output');
      }

      return {
        title: this.getRequiredString(rawIdea, 'title'),
        contentType: this.parseContentType(rawIdea.contentType),
        platform: this.parsePlatform(rawIdea.platform),
        angle: this.getOptionalString(rawIdea.angle),
      };
    });
  }

  private getGenerationInputDto(
    generation: AiGeneration,
  ): Record<string, unknown> {
    const inputDto = generation.input?.dto;

    return this.isRecord(inputDto) ? inputDto : {};
  }

  private getRequiredNumber(
    object: Record<string, unknown>,
    key: string,
  ): number {
    const value = object[key];

    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(
        `AI generation input is missing ${key}`,
      );
    }

    return value;
  }

  private getRequiredString(
    object: Record<string, unknown>,
    key: string,
  ): string {
    const value = object[key];

    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        `AI output is missing required string: ${key}`,
      );
    }

    return value.trim();
  }

  private getOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }

  private parseContentType(value: unknown): ContentType {
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid content type in AI output');
    }

    const normalized = value.trim().toUpperCase();

    if (
      Object.values(ContentType).includes(normalized as ContentType)
    ) {
      return normalized as ContentType;
    }

    throw new BadRequestException('Invalid content type in AI output');
  }

  private parsePlatform(value: unknown): ContentPlatform {
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid platform in AI output');
    }

    const normalized = value.trim().toUpperCase();

    if (
      Object.values(ContentPlatform).includes(
        normalized as ContentPlatform,
      )
    ) {
      return normalized as ContentPlatform;
    }

    throw new BadRequestException('Invalid platform in AI output');
  }

  private parseSuggestedDate(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T09:00:00.000Z`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }
}