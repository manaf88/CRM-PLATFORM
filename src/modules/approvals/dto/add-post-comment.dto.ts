import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AddPostCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  comment!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}