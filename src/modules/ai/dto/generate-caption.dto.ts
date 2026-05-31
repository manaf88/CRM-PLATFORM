import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class GenerateCaptionDto {
  @IsUUID()
  postId!: string;

  @IsOptional()
  @IsIn(['ar', 'en', 'fr', 'de'])
  language?: 'ar' | 'en' | 'fr' | 'de';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  numberOfOptions?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  toneOverride?: string;
}