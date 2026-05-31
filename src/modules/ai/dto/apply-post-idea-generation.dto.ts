import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ApplyPostIdeaGenerationDto {
  @IsInt()
  @Min(0)
  @Max(50)
  ideaIndex!: number;

  @IsOptional()
  @IsUUID()
  contentPlanId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}