import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { AddCompanyMemberDto } from './dto/add-company-member.dto';
import { UpdateCompanyMemberDto } from './dto/update-company-member.dto';

/**
 * The request may carry `roles` (a list) or the older `role` (a single value).
 * Everything past this point deals in lists only.
 */
function rolesFrom(dto: {
  roles?: CompanyMembershipRole[];
  role?: CompanyMembershipRole;
}): CompanyMembershipRole[] {
  if (dto.roles?.length) {
    return dto.roles;
  }

  if (dto.role) {
    return [dto.role];
  }

  throw new BadRequestException('Provide at least one role in `roles`');
}

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
@Controller('companies/:companyId/members')
export class CompanyMembersController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Put an existing employee on this client.
   *
   * Deciding who works on which client is Solutions management's call, so this
   * one route is narrowed further than the rest of the controller: the
   * class-level guard admits Account Managers, and this extra guard then
   * requires a platform administrator — who bypasses the company role check.
   * Both must pass, so effectively only administrators can staff a client.
   */
  @UseGuards(PlatformRolesGuard)
  @PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.AGENCY_ADMIN)
  @Post()
  addMember(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AddCompanyMemberDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.membershipsService.assignToCompany({
      companyId,
      userId: dto.userId,
      roles: rolesFrom(dto),
      invitedById: currentUser.id,
    });
  }

  @Get()
  findMembers(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.membershipsService.findAllByCompany(companyId);
  }

  @Patch(':membershipId')
  updateMember(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateCompanyMemberDto,
  ) {
    const roles =
      dto.roles ?? (dto.role !== undefined ? [dto.role] : undefined);

    return this.membershipsService.updateMembership(companyId, membershipId, {
      roles,
      status: dto.status,
    });
  }

  @Delete(':membershipId')
  deactivateMember(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.membershipsService.deactivateMembership(
      companyId,
      membershipId,
    );
  }
}
