import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { AiService } from './ai.service';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateContentPlanPreviewDto } from './dto/generate-content-plan-preview.dto';
import { GeneratePostIdeasDto } from './dto/generate-post-ideas.dto';
import { ApplyCaptionGenerationDto } from './dto/apply-caption-generation.dto';
import { ApplyContentPlanGenerationDto } from './dto/apply-content-plan-generation.dto';
import { ApplyPostIdeaGenerationDto } from './dto/apply-post-idea-generation.dto';
import { AiApplyService } from './ai-apply.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/ai')
export class AiController {
constructor(
  private readonly aiService: AiService,
  private readonly aiApplyService: AiApplyService,
) {}
  @Post('content-plan-preview')
  generateContentPlanPreview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: GenerateContentPlanPreviewDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiService.generateContentPlanPreview(
      companyId,
      dto,
      currentUser,
    );
  }

  @Post('post-ideas')
  generatePostIdeas(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: GeneratePostIdeasDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiService.generatePostIdeas(
      companyId,
      dto,
      currentUser,
    );
  }

  @Post('caption')
  generateCaption(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: GenerateCaptionDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiService.generateCaption(companyId, dto, currentUser);
  }

  @Get('generations')
  findAllGenerations(
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.aiService.findAllGenerations(companyId);
  }

  @Get('generations/:generationId')
  findOneGeneration(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
  ) {
    return this.aiService.findOneGeneration(companyId, generationId);
  }
    @Post('generations/:generationId/apply-content-plan')
  applyContentPlanGeneration(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
    @Body() dto: ApplyContentPlanGenerationDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiApplyService.applyContentPlanGeneration(
      companyId,
      generationId,
      dto,
      currentUser,
    );
  }

  @Post('generations/:generationId/apply-caption')
  applyCaptionGeneration(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
    @Body() dto: ApplyCaptionGenerationDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiApplyService.applyCaptionGeneration(
      companyId,
      generationId,
      dto,
      currentUser,
    );
  }

  @Post('generations/:generationId/apply-post-idea')
  applyPostIdeaGeneration(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('generationId', ParseUUIDPipe) generationId: string,
    @Body() dto: ApplyPostIdeaGenerationDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.aiApplyService.applyPostIdeaGeneration(
      companyId,
      generationId,
      dto,
      currentUser,
    );
  }
}