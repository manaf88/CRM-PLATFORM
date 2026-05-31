import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMonthlyReportDto {
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
  @MaxLength(3000)
  notes?: string;
}