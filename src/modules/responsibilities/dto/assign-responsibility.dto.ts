import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ResponsibilityType } from '../enums/responsibility-type.enum';

export class AssignResponsibilityDto {
  @IsUUID()
  areaId!: string;

  @IsUUID()
  memberUserId!: string;

  @IsEnum(ResponsibilityType)
  type!: ResponsibilityType;

  /**
   * Required only when `type === OTHER`. Ignored (and cleared) otherwise.
   */
  @ValidateIf((dto: AssignResponsibilityDto) => dto.type === ResponsibilityType.OTHER)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  customLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}