import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeadNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  note!: string;
}