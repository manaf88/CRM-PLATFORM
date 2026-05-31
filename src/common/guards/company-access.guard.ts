import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { RequestUser } from '../../modules/auth/types/request-user.type';
import { PlatformRole } from '../../modules/users/enums/platform-role.enum';
import { MembershipsService } from '../../modules/memberships/memberships.service';

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  constructor(
    private readonly membershipsService: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const user = request.user as RequestUser | undefined;
    const companyId = request.params?.companyId;

    if (!user) {
      return false;
    }

    if (!companyId) {
      return true;
    }

    if (
      user.platformRole === PlatformRole.SUPER_ADMIN ||
      user.platformRole === PlatformRole.AGENCY_ADMIN
    ) {
      return true;
    }

    const hasAccess =
      await this.membershipsService.existsActiveMembership(
        user.id,
        companyId,
      );

    if (!hasAccess) {
      throw new ForbiddenException(
        'You do not have access to this company',
      );
    }

    return true;
  }
}