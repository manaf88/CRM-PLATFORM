import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AiGeneration } from './entities/ai-generation.entity';
import { AiGenerationStatus } from './enums/ai-generation-status.enum';
import { AiGenerationType } from './enums/ai-generation-type.enum';

type CreateAiGenerationInput = {
  companyId: string;
  userId: string;
  type: AiGenerationType;
  status: AiGenerationStatus;
  provider: string;
  model: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  tokensUsed?: number | null;
};

@Injectable()
export class AiGenerationsService {
  constructor(
    @InjectRepository(AiGeneration)
    private readonly aiGenerationsRepository: Repository<AiGeneration>,
  ) {}

  async create(input: CreateAiGenerationInput): Promise<AiGeneration> {
    const generation = this.aiGenerationsRepository.create({
      companyId: input.companyId,
      userId: input.userId,
      type: input.type,
      status: input.status,
      provider: input.provider,
      model: input.model,
      input: input.input,
      output: input.output ?? null,
      errorMessage: input.errorMessage ?? null,
      tokensUsed: input.tokensUsed ?? null,
    });

    return this.aiGenerationsRepository.save(generation);
  }

  async findAll(companyId: string): Promise<AiGeneration[]> {
    return this.aiGenerationsRepository.find({
      where: { companyId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(
    companyId: string,
    generationId: string,
  ): Promise<AiGeneration> {
    const generation = await this.aiGenerationsRepository.findOne({
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
}