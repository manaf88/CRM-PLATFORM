import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PostApprovalNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}