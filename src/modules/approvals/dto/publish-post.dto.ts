import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class PublishPostDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  publishedUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}