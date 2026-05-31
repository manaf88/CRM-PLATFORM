import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ApplyContentPlanGenerationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  titleOverride?: string;

  @IsOptional()
  @IsBoolean()
  createPosts?: boolean;
}