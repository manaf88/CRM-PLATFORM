import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  PLATFORM_ROLES_KEY,
} from '../decorators/platform-roles.decorator';
import { RequestUser } from '../../modules/auth/types/request-user.type';
import { PlatformRole } from '../../modules/users/enums/platform-role.enum';

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<PlatformRole[]>(
        PLATFORM_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user) {
      return false;
    }

    return requiredRoles.includes(user.platformRole);
  }
}