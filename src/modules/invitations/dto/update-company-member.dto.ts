import { IsEnum, IsOptional } from 'class-validator';

import { CompanyMembershipRole } from '../../memberships/enums/company-membership-role.enum';
import { CompanyMembershipStatus } from '../../memberships/enums/company-membership-status.enum';

export class UpdateCompanyMemberDto {
  @IsOptional()
  @IsEnum(CompanyMembershipRole)
  role?: CompanyMembershipRole;

  @IsOptional()
  @IsEnum(CompanyMembershipStatus)
  status?: CompanyMembershipStatus;
}