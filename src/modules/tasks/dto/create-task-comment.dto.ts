import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  comment!: string;
}