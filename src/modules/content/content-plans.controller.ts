import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { ContentPlansService } from './content-plans.service';
import { CreateContentPlanDto } from './dto/create-content-plan.dto';
import { UpdateContentPlanDto } from './dto/update-content-plan.dto';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/content-plans')
export class ContentPlansController {
  constructor(
    private readonly contentPlansService: ContentPlansService,
  ) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateContentPlanDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.contentPlansService.create(
      companyId,
      dto,
      currentUser,
    );
  }

  @Get()
  findAll(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.contentPlansService.findAll(companyId);
  }

  @Get(':contentPlanId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('contentPlanId', ParseUUIDPipe) contentPlanId: string,
  ) {
    return this.contentPlansService.findOne(companyId, contentPlanId);
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Patch(':contentPlanId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('contentPlanId', ParseUUIDPipe) contentPlanId: string,
    @Body() dto: UpdateContentPlanDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.contentPlansService.update(
      companyId,
      contentPlanId,
      dto,
      currentUser,
    );
  }
}