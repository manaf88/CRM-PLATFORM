import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AssignResponsibilityDto } from './dto/assign-responsibility.dto';
import { BulkAssignResponsibilitiesDto } from './dto/bulk-assign-responsibilities.dto';
import { FindResponsibilityAssignmentsQueryDto } from './dto/find-responsibility-assignments-query.dto';
import { UpdateResponsibilityAssignmentDto } from './dto/update-responsibility-assignment.dto';
import { ResponsibilityAssignmentsService } from './responsibility-assignments.service';

const RESPONSIBILITY_VIEW_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.SALES_AGENT,
];

const RESPONSIBILITY_MANAGE_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
];

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/responsibility-assignments')
export class ResponsibilityAssignmentsController {
  constructor(
    private readonly assignmentsService: ResponsibilityAssignmentsService,
  ) {}

  // Assign a single cell (upsert on (area, member)).
  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Post()
  assign(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AssignResponsibilityDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.assignmentsService.assign(companyId, dto, currentUser);
  }

  // Atomic grid save.
  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Post('bulk')
  bulkAssign(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: BulkAssignResponsibilitiesDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.assignmentsService.bulkAssign(companyId, dto, currentUser);
  }

  // Declared before ':assignmentId' so it is not captured as a param.
  @CompanyRoles(...RESPONSIBILITY_VIEW_ROLES)
  @Get('matrix')
  getMatrix(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.assignmentsService.getMatrix(companyId);
  }

  @CompanyRoles(...RESPONSIBILITY_VIEW_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindResponsibilityAssignmentsQueryDto,
  ) {
    return this.assignmentsService.findAll(companyId, query);
  }

  @CompanyRoles(...RESPONSIBILITY_VIEW_ROLES)
  @Get(':assignmentId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.assignmentsService.findOne(companyId, assignmentId);
  }

  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Patch(':assignmentId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateResponsibilityAssignmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.assignmentsService.update(
      companyId,
      assignmentId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Delete(':assignmentId')
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.assignmentsService.remove(companyId, assignmentId);
  }
}