import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';

import { ContentPostStatus } from '../enums/content-post-status.enum';
import { CreateContentPostDto } from './create-content-post.dto';

export class UpdateContentPostDto extends PartialType(
  CreateContentPostDto,
) {
  @IsOptional()
  @IsEnum(ContentPostStatus)
  status?: ContentPostStatus;
}