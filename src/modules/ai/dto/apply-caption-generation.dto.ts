import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class ApplyCaptionGenerationDto {
  @IsUUID()
  postId!: string;

  @IsInt()
  @Min(0)
  @Max(10)
  captionIndex!: number;
}