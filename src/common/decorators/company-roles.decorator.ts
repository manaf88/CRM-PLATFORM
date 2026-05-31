import { SetMetadata } from '@nestjs/common';

import { CompanyMembershipRole } from '../../modules/memberships/enums/company-membership-role.enum';

export const COMPANY_ROLES_KEY = 'company_roles';

export const CompanyRoles = (...roles: CompanyMembershipRole[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);