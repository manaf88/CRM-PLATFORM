import {
  IsHexColor,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class BrandColorItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsHexColor()
  hex!: string;
}