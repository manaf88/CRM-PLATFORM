import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class BrandOfferItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  validUntil?: string;
}