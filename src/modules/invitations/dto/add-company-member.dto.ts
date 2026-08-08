import { IsEnum, IsUUID } from 'class-validator';

import { CompanyMembershipRole } from '../../memberships/enums/company-membership-role.enum';

/** Puts an existing employee on a client. */
export class AddCompanyMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(CompanyMembershipRole)
  role!: CompanyMembershipRole;
}
