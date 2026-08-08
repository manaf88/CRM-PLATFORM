import { registerAs } from '@nestjs/config';

import { CompanyMembershipRole } from '../modules/memberships/enums/company-membership-role.enum';

/**
 * The platform runs as a single shared workspace: every account is placed in
 * the same company on sign-up, so nobody is ever asked to create one.
 *
 * DEFAULT_COMPANY_ID wins when set (point it at an existing company).
 * Otherwise the company is looked up — and created once if missing — by name.
 */
export default registerAs('workspace', () => ({
  defaultCompanyId: process.env.DEFAULT_COMPANY_ID || null,
  defaultCompanyName: process.env.DEFAULT_COMPANY_NAME || 'Solutions',
  defaultMemberRole:
    (process.env.DEFAULT_MEMBER_ROLE as CompanyMembershipRole) ||
    CompanyMembershipRole.ACCOUNT_MANAGER,
}));
