import { IsEnum } from 'class-validator';

import { PlatformRole } from '../enums/platform-role.enum';

/**
 * Assigning admins. Deliberately its own route and its own body so that a
 * role change can never ride along inside a general profile update.
 */
export class UpdatePlatformRoleDto {
  @IsEnum(PlatformRole)
  platformRole!: PlatformRole;
}
