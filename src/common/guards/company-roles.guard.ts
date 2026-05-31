import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  COMPANY_ROLES_KEY,
} from '../decorators/company-roles.decorator';
import { RequestUser } from '../../modules/auth/types/request-user.type';
import { MembershipsService } from '../../modules/memberships/memberships.service';
import { CompanyMembershipRole } from '../../modules/memberships/enums/company-membership-role.enum';
import { PlatformRole } from '../../modules/users/enums/platform-role.enum';

@Injectable()
export class CompanyRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly membershipsService: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<CompanyMembershipRole[]>(
        COMPANY_ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    const companyId = request.params?.companyId;

    if (!user || !companyId) {
      return false;
    }

    if (user.platformRole === PlatformRole.SUPER_ADMIN) {
      return true;
    }

    if (user.platformRole === PlatformRole.AGENCY_ADMIN) {
      return true;
    }

    const membershipRole =
      await this.membershipsService.findActiveMembershipRole(
        user.id,
        companyId,
      );

    if (!membershipRole || !requiredRoles.includes(membershipRole)) {
      throw new ForbiddenException(
        'You do not have the required role for this company action',
      );
    }

    return true;
  }
}