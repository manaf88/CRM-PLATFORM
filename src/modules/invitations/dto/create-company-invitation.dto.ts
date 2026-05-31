import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { CompanyMembershipRole } from '../../memberships/enums/company-membership-role.enum';

export class CreateCompanyInvitationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsEnum(CompanyMembershipRole)
  role!: CompanyMembershipRole;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;
}