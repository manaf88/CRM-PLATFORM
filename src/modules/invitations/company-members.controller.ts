import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { UpdateCompanyMemberDto } from './dto/update-company-member.dto';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
@Controller('companies/:companyId/members')
export class CompanyMembersController {
  constructor(
    private readonly membershipsService: MembershipsService,
  ) {}

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
    return this.membershipsService.updateMembership(
      companyId,
      membershipId,
      dto,
    );
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