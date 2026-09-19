import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The note is required, but it is validated in the service rather than here:
 * an empty note answers 422 with a code the frontend can act on, while the
 * validation pipe would answer a plain 400.
 */
export class RequestTaskChangesDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  note?: string;
}
