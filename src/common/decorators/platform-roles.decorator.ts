import { SetMetadata } from '@nestjs/common';

import { PlatformRole } from '../../modules/users/enums/platform-role.enum';

export const PLATFORM_ROLES_KEY = 'platform_roles';

export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);