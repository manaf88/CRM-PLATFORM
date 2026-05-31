import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import OpenAI from 'openai';

import { AiGenerationType } from './enums/ai-generation-type.enum';
import { AiProvider } from './enums/ai-provider.enum';
import {
  GenerateJsonInput,
  GenerateJsonResult,
} from './types/ai-provider.types';

@Injectable()
export class AiProviderService {
  private readonly openaiClient: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const provider = this.getProvider();
    const apiKey = this.configService.get<string>('ai.apiKey');

    this.openaiClient =
      provider === AiProvider.OPENAI && apiKey
        ? new OpenAI({ apiKey })
        : null;
  }

  async generateJson(
    input: GenerateJsonInput,
  ): Promise<GenerateJsonResult> {
    const provider = this.getProvider();

    if (provider === AiProvider.MOCK) {
      return this.generateMockJson(input);
    }

    if (provider === AiProvider.OPENAI) {
      return this.generateOpenAiJson(input);
    }

    throw new ServiceUnavailableException('Unsupported AI provider');
  }

  private async generateOpenAiJson(
    input: GenerateJsonInput,
  ): Promise<GenerateJsonResult> {
    if (!this.openaiClient) {
      throw new ServiceUnavailableException(
        'OpenAI provider is not configured',
      );
    }

    const model = this.getModel();

    const completion =
      await this.openaiClient.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: input.systemPrompt,
          },
          {
            role: 'user',
            content: input.userPrompt,
          },
        ],
        response_format: {
          type: 'json_object',
        },
        temperature: 0.7,
      });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent) {
      throw new InternalServerErrorException(
        'AI provider returned an empty response',
      );
    }

    try {
      const parsed = JSON.parse(rawContent) as Record<string, unknown>;

      return {
        output: parsed,
        model,
        provider: AiProvider.OPENAI,
        tokensUsed: completion.usage?.total_tokens ?? null,
      };
    } catch {
      throw new InternalServerErrorException(
        'AI provider returned invalid JSON',
      );
    }
  }

  private generateMockJson(
    input: GenerateJsonInput,
  ): GenerateJsonResult {
    const model = this.getModel();

    if (input.task === AiGenerationType.CONTENT_PLAN_PREVIEW) {
      return {
        provider: AiProvider.MOCK,
        model,
        tokensUsed: 0,
        output: {
          title: 'Mock Monthly Content Plan',
          summary:
            'This is a mock AI-generated content plan preview for testing.',
          posts: [
            {
              title: 'Laser Hair Removal FAQ',
              contentType: 'CAROUSEL',
              platform: 'INSTAGRAM',
              caption:
                'كل بشرة إلها احتياجاتها. احجزي استشارتك لمعرفة التفاصيل المناسبة لك.',
              visualBrief:
                'Premium carousel with soft colors and five FAQ slides.',
              suggestedDate: '2026-06-05',
            },
            {
              title: 'Behind the Clinic',
              contentType: 'REEL',
              platform: 'INSTAGRAM',
              caption:
                'جولة قصيرة من داخل العيادة لتعريفكم على أجوائنا ومعايير العناية.',
              visualBrief:
                'Short calm reel showing reception, treatment room, and team preparation.',
              suggestedDate: '2026-06-09',
            },
          ],
        },
      };
    }

    if (input.task === AiGenerationType.POST_IDEAS) {
      return {
        provider: AiProvider.MOCK,
        model,
        tokensUsed: 0,
        output: {
          ideas: [
            {
              title: '5 أسئلة شائعة عن جلسات الليزر',
              contentType: 'CAROUSEL',
              platform: 'INSTAGRAM',
              angle: 'Educational trust-building content',
            },
            {
              title: 'كيف تجهزين بشرتك قبل الجلسة؟',
              contentType: 'POST',
              platform: 'INSTAGRAM',
              angle: 'Practical skincare tips',
            },
            {
              title: 'جولة هادئة من داخل العيادة',
              contentType: 'REEL',
              platform: 'INSTAGRAM',
              angle: 'Behind the scenes credibility',
            },
          ],
        },
      };
    }

    return {
      provider: AiProvider.MOCK,
      model,
      tokensUsed: 0,
      output: {
        captions: [
          'جلسات الليزر ليست مجرد موعد تجميلي، بل تجربة تحتاج عناية وفهم لنوع البشرة. احجزي استشارتك لمعرفة التفاصيل المناسبة لك.',
          'لأن كل بشرة تختلف، نبدأ دائماً بفهم احتياجك قبل تحديد الخطة المناسبة. راسلينا للتفاصيل.',
          'عناية آمنة، تواصل واضح، وتجربة مريحة من أول استشارة. احجزي موعدك اليوم.',
        ],
      },
    };
  }

  private getProvider(): AiProvider {
    return this.configService.getOrThrow<AiProvider>('ai.provider');
  }

  private getModel(): string {
    return this.configService.getOrThrow<string>('ai.model');
  }
}