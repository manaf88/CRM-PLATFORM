import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAttachmentDto {
  @IsUUID()
  fileId!: string;

  /** Optional caption, e.g. "Client reference". */
  @IsOptional()
  @IsString()
  @MaxLength(180)
  label?: string;
}
