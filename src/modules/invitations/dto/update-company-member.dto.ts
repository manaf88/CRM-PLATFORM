import { ArrayNotEmpty, IsArray, IsEnum, IsOptional } from 'class-validator';

import { CompanyMembershipRole } from '../../memberships/enums/company-membership-role.enum';
import { CompanyMembershipStatus } from '../../memberships/enums/company-membership-status.enum';

/**
 * Changing what somebody does on a client. `roles` replaces the whole set, so
 * send the full list you want them to end up with, not just the additions.
 */
export class UpdateCompanyMemberDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(CompanyMembershipRole, { each: true })
  roles?: CompanyMembershipRole[];

  /** @deprecated Use `roles`. */
  @IsOptional()
  @IsEnum(CompanyMembershipRole)
  role?: CompanyMembershipRole;

  @IsOptional()
  @IsEnum(CompanyMembershipStatus)
  status?: CompanyMembershipStatus;
}
