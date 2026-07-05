import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ResponsibilityType } from '../enums/responsibility-type.enum';

export class UpdateResponsibilityAssignmentDto {
  @IsOptional()
  @IsEnum(ResponsibilityType)
  type?: ResponsibilityType;

  /**
   * Required when the resulting type is OTHER. When the caller sends
   * `type === OTHER` they must also send a customLabel. When switching
   * away from OTHER the service clears any stored label.
   */
  @ValidateIf((dto: UpdateResponsibilityAssignmentDto) => dto.type === ResponsibilityType.OTHER)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}