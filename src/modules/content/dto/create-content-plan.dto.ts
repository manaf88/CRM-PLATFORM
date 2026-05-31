import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContentPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2024)
  @Max(2100)
  year!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1500)
  goal?: string;
}