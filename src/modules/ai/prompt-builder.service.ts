import { Injectable } from '@nestjs/common';

import { BrandProfile } from '../brand-profiles/entities/brand-profile.entity';
import { ContentPost } from '../content/entities/content-post.entity';
import { GenerateCaptionDto } from './dto/generate-caption.dto';
import { GenerateContentPlanPreviewDto } from './dto/generate-content-plan-preview.dto';
import { GeneratePostIdeasDto } from './dto/generate-post-ideas.dto';

@Injectable()
export class PromptBuilderService {
  buildBaseSystemPrompt(): string {
    return [
      'You are a senior social media strategist and copywriter.',
      'You write practical, brand-consistent content for small and medium businesses.',
      'You must avoid exaggerated, unsafe, or misleading claims.',
      'Return JSON only. Do not include markdown. Do not include explanations outside JSON.',
    ].join('\n');
  }

  buildBrandContext(brandProfile: BrandProfile): string {
    return [
      `Brand name: ${brandProfile.brandName}`,
      `Industry: ${brandProfile.industry ?? 'Not specified'}`,
      `Description: ${brandProfile.description ?? 'Not specified'}`,
      `Target audience: ${brandProfile.targetAudience ?? 'Not specified'}`,
      `Tone of voice: ${brandProfile.toneOfVoice ?? 'Not specified'}`,
      `Languages: ${JSON.stringify(brandProfile.languages)}`,
      `Colors: ${JSON.stringify(brandProfile.colors)}`,
      `Services: ${JSON.stringify(brandProfile.services)}`,
      `Offers: ${JSON.stringify(brandProfile.offers)}`,
      `Service areas: ${JSON.stringify(brandProfile.serviceAreas)}`,
      `CTA preferences: ${JSON.stringify(brandProfile.ctaPreferences)}`,
      `Forbidden words: ${JSON.stringify(brandProfile.forbiddenWords)}`,
      `Brand notes: ${brandProfile.brandNotes ?? 'Not specified'}`,
    ].join('\n');
  }

  buildContentPlanPrompt(
    brandProfile: BrandProfile,
    dto: GenerateContentPlanPreviewDto,
  ): string {
    return [
      this.buildBrandContext(brandProfile),
      '',
      'Task:',
      `Generate a monthly content plan preview for ${dto.month}/${dto.year}.`,
      `Goal: ${dto.goal}`,
      `Number of posts: ${dto.numberOfPosts ?? 8}`,
      `Language: ${dto.language ?? 'ar'}`,
      `Platforms: ${JSON.stringify(dto.platforms ?? ['INSTAGRAM'])}`,
      '',
      'Required JSON shape:',
      JSON.stringify({
        title: 'string',
        summary: 'string',
        posts: [
          {
            title: 'string',
            contentType: 'POST | REEL | STORY | CAROUSEL | VIDEO',
            platform: 'INSTAGRAM | FACEBOOK | TIKTOK | LINKEDIN | WHATSAPP | WEBSITE',
            caption: 'string',
            visualBrief: 'string',
            suggestedDate: 'YYYY-MM-DD',
          },
        ],
      }),
    ].join('\n');
  }

  buildPostIdeasPrompt(
    brandProfile: BrandProfile,
    dto: GeneratePostIdeasDto,
  ): string {
    return [
      this.buildBrandContext(brandProfile),
      '',
      'Task:',
      `Generate ${dto.count ?? 6} post ideas.`,
      `Goal: ${dto.goal}`,
      `Language: ${dto.language ?? 'ar'}`,
      `Platform: ${dto.platform ?? 'Any suitable platform'}`,
      `Content type: ${dto.contentType ?? 'Any suitable content type'}`,
      '',
      'Required JSON shape:',
      JSON.stringify({
        ideas: [
          {
            title: 'string',
            contentType: 'POST | REEL | STORY | CAROUSEL | VIDEO',
            platform: 'INSTAGRAM | FACEBOOK | TIKTOK | LINKEDIN | WHATSAPP | WEBSITE',
            angle: 'string',
          },
        ],
      }),
    ].join('\n');
  }

  buildCaptionPrompt(
    brandProfile: BrandProfile,
    post: ContentPost,
    dto: GenerateCaptionDto,
  ): string {
    return [
      this.buildBrandContext(brandProfile),
      '',
      'Post context:',
      `Title: ${post.title}`,
      `Content type: ${post.contentType}`,
      `Platform: ${post.platform}`,
      `Current caption: ${post.caption ?? 'Not specified'}`,
      `Visual brief: ${post.visualBrief ?? 'Not specified'}`,
      '',
      'Task:',
      `Generate ${dto.numberOfOptions ?? 3} caption options.`,
      `Language: ${dto.language ?? 'ar'}`,
      `Tone override: ${dto.toneOverride ?? 'Use brand tone of voice'}`,
      '',
      'Required JSON shape:',
      JSON.stringify({
        captions: ['string'],
      }),
    ].join('\n');
  }
}