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

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AutomationRulesService } from './automation-rules.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
@Controller('companies/:companyId/automation-rules')
export class AutomationRulesController {
  constructor(
    private readonly automationRulesService: AutomationRulesService,
  ) {}

  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateAutomationRuleDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.automationRulesService.create(
      companyId,
      dto,
      currentUser,
    );
  }

  @Get()
  findAll(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.automationRulesService.findAll(companyId);
  }

  @Get(':automationRuleId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('automationRuleId', ParseUUIDPipe) automationRuleId: string,
  ) {
    return this.automationRulesService.findOne(
      companyId,
      automationRuleId,
    );
  }

  @Patch(':automationRuleId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('automationRuleId', ParseUUIDPipe) automationRuleId: string,
    @Body() dto: UpdateAutomationRuleDto,
  ) {
    return this.automationRulesService.update(
      companyId,
      automationRuleId,
      dto,
    );
  }
}