import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { FindLeadsQueryDto } from './dto/find-leads-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';
import { CompanyRoles } from 'src/common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from 'src/common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
  CompanyMembershipRole.CLIENT_OWNER,
)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateLeadDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.leadsService.create(companyId, dto, currentUser);
  }

  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindLeadsQueryDto,
  ) {
    return this.leadsService.findAll(companyId, query);
  }

  @Get(':leadId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leadsService.findOne(companyId, leadId);
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
  CompanyMembershipRole.CLIENT_OWNER,
)
  @Patch(':leadId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.leadsService.update(
      companyId,
      leadId,
      dto,
      currentUser,
    );
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
  CompanyMembershipRole.CLIENT_OWNER,
)
  @Patch(':leadId/status')
  updateStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.leadsService.updateStatus(
      companyId,
      leadId,
      dto,
      currentUser,
    );
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
  CompanyMembershipRole.CLIENT_OWNER,
)
  @Post(':leadId/notes')
  addNote(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateLeadNoteDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.leadsService.addNote(
      companyId,
      leadId,
      dto,
      currentUser,
    );
  }

  @Get(':leadId/notes')
  findNotes(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leadsService.findNotes(companyId, leadId);
  }

  @Get(':leadId/status-history')
  findStatusHistory(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.leadsService.findStatusHistory(companyId, leadId);
  }
}