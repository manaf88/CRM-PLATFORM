import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { CompanyMembershipRole } from '../../memberships/enums/company-membership-role.enum';

/**
 * Puts an existing employee on a client, in one or more roles.
 *
 * `roles` is the field to use. `role` is still accepted so the current
 * frontend keeps working, and is treated as a one-item list; send one or the
 * other, not both.
 */
export class AddCompanyMemberDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(CompanyMembershipRole, { each: true })
  roles?: CompanyMembershipRole[];

  /** @deprecated Use `roles`. */
  @IsOptional()
  @IsEnum(CompanyMembershipRole)
  role?: CompanyMembershipRole;
}
