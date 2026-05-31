import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateCompanyInvitationDto } from './dto/create-company-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller()
export class InvitationsController {
  constructor(
    private readonly invitationsService: InvitationsService,
  ) {}

  @UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @Post('companies/:companyId/invitations')
  createInvitation(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateCompanyInvitationDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.invitationsService.createInvitation(
      companyId,
      dto,
      currentUser,
    );
  }

  @UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @Get('companies/:companyId/invitations')
  findInvitations(
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.invitationsService.findInvitations(companyId);
  }

  @Post('auth/accept-invitation')
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.invitationsService.acceptInvitation(dto);
  }
}