import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { BrandProfilesService } from '../brand-profiles/brand-profiles.service';
import { ContentPostsService } from '../content/content-posts.service';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateContentPlanPreviewDto } from './dto/generate-content-plan-preview.dto';
import { GeneratePostIdeasDto } from './dto/generate-post-ideas.dto';
import { AiGenerationStatus } from './enums/ai-generation-status.enum';
import { AiGenerationType } from './enums/ai-generation-type.enum';
import { AiGenerationsService } from './ai-generations.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';

@Injectable()
export class AiService {
  constructor(
    private readonly brandProfilesService: BrandProfilesService,
    private readonly contentPostsService: ContentPostsService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly aiProviderService: AiProviderService,
    private readonly aiGenerationsService: AiGenerationsService,
  ) {}

  async generateContentPlanPreview(
    companyId: string,
    dto: GenerateContentPlanPreviewDto,
    currentUser: RequestUser,
  ) {
    const brandProfile =
      await this.brandProfilesService.findByCompanyId(companyId);

    const systemPrompt = this.promptBuilderService.buildBaseSystemPrompt();
    const userPrompt =
      this.promptBuilderService.buildContentPlanPrompt(
        brandProfile,
        dto,
      );

    return this.generateAndStore({
      companyId,
      currentUser,
      type: AiGenerationType.CONTENT_PLAN_PREVIEW,
      input: {
        dto,
        systemPrompt,
        userPrompt,
      },
      systemPrompt,
      userPrompt,
    });
  }

  async generatePostIdeas(
    companyId: string,
    dto: GeneratePostIdeasDto,
    currentUser: RequestUser,
  ) {
    const brandProfile =
      await this.brandProfilesService.findByCompanyId(companyId);

    const systemPrompt = this.promptBuilderService.buildBaseSystemPrompt();
    const userPrompt =
      this.promptBuilderService.buildPostIdeasPrompt(
        brandProfile,
        dto,
      );

    return this.generateAndStore({
      companyId,
      currentUser,
      type: AiGenerationType.POST_IDEAS,
      input: {
        dto,
        systemPrompt,
        userPrompt,
      },
      systemPrompt,
      userPrompt,
    });
  }

  async generateCaption(
    companyId: string,
    dto: GenerateCaptionDto,
    currentUser: RequestUser,
  ) {
    const brandProfile =
      await this.brandProfilesService.findByCompanyId(companyId);

    const post = await this.contentPostsService.findOne(
      companyId,
      dto.postId,
    );

    const systemPrompt = this.promptBuilderService.buildBaseSystemPrompt();
    const userPrompt = this.promptBuilderService.buildCaptionPrompt(
      brandProfile,
      post,
      dto,
    );

    return this.generateAndStore({
      companyId,
      currentUser,
      type: AiGenerationType.CAPTION_SUGGESTION,
      input: {
        dto,
        postId: post.id,
        systemPrompt,
        userPrompt,
      },
      systemPrompt,
      userPrompt,
    });
  }

  async findAllGenerations(companyId: string) {
    return this.aiGenerationsService.findAll(companyId);
  }

  async findOneGeneration(companyId: string, generationId: string) {
    return this.aiGenerationsService.findOne(companyId, generationId);
  }

  private async generateAndStore(input: {
    companyId: string;
    currentUser: RequestUser;
    type: AiGenerationType;
    input: Record<string, unknown>;
    systemPrompt: string;
    userPrompt: string;
  }) {
    try {
      const result = await this.aiProviderService.generateJson({
        task: input.type,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
      });

      const generation = await this.aiGenerationsService.create({
        companyId: input.companyId,
        userId: input.currentUser.id,
        type: input.type,
        status: AiGenerationStatus.SUCCEEDED,
        provider: result.provider,
        model: result.model,
        input: input.input,
        output: result.output,
        tokensUsed: result.tokensUsed ?? null,
      });

      return {
        generation,
        output: result.output,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown AI generation error';

      await this.aiGenerationsService.create({
        companyId: input.companyId,
        userId: input.currentUser.id,
        type: input.type,
        status: AiGenerationStatus.FAILED,
        provider: 'unknown',
        model: 'unknown',
        input: input.input,
        output: null,
        errorMessage: message,
        tokensUsed: null,
      });

      throw new InternalServerErrorException(message);
    }
  }
}