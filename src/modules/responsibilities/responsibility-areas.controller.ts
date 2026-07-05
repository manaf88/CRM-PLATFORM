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
import { CreateResponsibilityAreaDto } from './dto/create-responsibility-area.dto';
import { FindResponsibilityAreasQueryDto } from './dto/find-responsibility-areas-query.dto';
import { UpdateResponsibilityAreaDto } from './dto/update-responsibility-area.dto';
import { ResponsibilityAreasService } from './responsibility-areas.service';

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
@Controller('companies/:companyId/responsibility-areas')
export class ResponsibilityAreasController {
  constructor(
    private readonly areasService: ResponsibilityAreasService,
  ) {}

  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateResponsibilityAreaDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.areasService.create(companyId, dto, currentUser);
  }

  @CompanyRoles(...RESPONSIBILITY_VIEW_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindResponsibilityAreasQueryDto,
  ) {
    return this.areasService.findAll(companyId, query);
  }

  @CompanyRoles(...RESPONSIBILITY_VIEW_ROLES)
  @Get(':areaId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('areaId', ParseUUIDPipe) areaId: string,
  ) {
    return this.areasService.findOne(companyId, areaId);
  }

  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Patch(':areaId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('areaId', ParseUUIDPipe) areaId: string,
    @Body() dto: UpdateResponsibilityAreaDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.areasService.update(companyId, areaId, dto, currentUser);
  }

  @CompanyRoles(...RESPONSIBILITY_MANAGE_ROLES)
  @Delete(':areaId')
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('areaId', ParseUUIDPipe) areaId: string,
  ) {
    return this.areasService.remove(companyId, areaId);
  }
}