import { IsUUID } from 'class-validator';

export class AttachTaskFileDto {
  @IsUUID()
  fileId!: string;
}