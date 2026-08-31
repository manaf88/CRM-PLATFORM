import { CompanyMembership } from './company-membership.entity';
import { CompanyMembershipRole } from '../enums/company-membership-role.enum';

/**
 * `effectiveRoles` is what every permission check reads, so its fallback
 * behaviour decides whether a half-migrated row locks somebody out of a client
 * or quietly keeps working.
 */
describe('CompanyMembership.effectiveRoles', () => {
  const membershipWith = (
    roles: CompanyMembershipRole[] | undefined,
    role?: CompanyMembershipRole,
  ): CompanyMembership => {
    const membership = new CompanyMembership();

    membership.roles = roles as CompanyMembershipRole[];
    membership.role = role as CompanyMembershipRole;

    return membership;
  };

  it('returns every role when the list is populated', () => {
    const membership = membershipWith([
      CompanyMembershipRole.DESIGNER,
      CompanyMembershipRole.COPYWRITER,
    ]);

    expect(membership.effectiveRoles).toEqual([
      CompanyMembershipRole.DESIGNER,
      CompanyMembershipRole.COPYWRITER,
    ]);
  });

  it('falls back to the single role for a row written before the migration', () => {
    const membership = membershipWith([], CompanyMembershipRole.DESIGNER);

    expect(membership.effectiveRoles).toEqual([CompanyMembershipRole.DESIGNER]);
  });

  it('falls back when the column is missing entirely', () => {
    const membership = membershipWith(
      undefined,
      CompanyMembershipRole.SALES_AGENT,
    );

    expect(membership.effectiveRoles).toEqual([
      CompanyMembershipRole.SALES_AGENT,
    ]);
  });

  it('grants nothing when there is no role at all, rather than guessing', () => {
    expect(membershipWith(undefined, undefined).effectiveRoles).toEqual([]);
  });

  it('prefers the list over the legacy column when they disagree', () => {
    const membership = membershipWith(
      [CompanyMembershipRole.ACCOUNT_MANAGER],
      CompanyMembershipRole.DESIGNER,
    );

    expect(membership.effectiveRoles).toEqual([
      CompanyMembershipRole.ACCOUNT_MANAGER,
    ]);
  });
});
