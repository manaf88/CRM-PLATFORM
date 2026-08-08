import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PlatformRole } from '../enums/platform-role.enum';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Temporary password handed to the employee; they can change it later. */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  /** Defaults to USER — only set this to create another administrator. */
  @IsOptional()
  @IsEnum(PlatformRole)
  platformRole?: PlatformRole;
}
