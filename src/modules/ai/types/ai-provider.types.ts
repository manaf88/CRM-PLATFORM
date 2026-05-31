import { AiGenerationType } from '../enums/ai-generation-type.enum';

export type GenerateJsonInput = {
  task: AiGenerationType;
  systemPrompt: string;
  userPrompt: string;
};

export type GenerateJsonResult = {
  output: Record<string, unknown>;
  model: string;
  provider: string;
  tokensUsed?: number | null;
};