import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AutomationRunsService } from './automation-runs.service';
import { FindAutomationRunsQueryDto } from './dto/find-automation-runs-query.dto';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
@Controller('companies/:companyId/automation-runs')
export class AutomationRunsController {
  constructor(
    private readonly automationRunsService: AutomationRunsService,
  ) {}

  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindAutomationRunsQueryDto,
  ) {
    return this.automationRunsService.findAll(companyId, query);
  }

  @Get(':automationRunId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('automationRunId', ParseUUIDPipe) automationRunId: string,
  ) {
    return this.automationRunsService.findOne(
      companyId,
      automationRunId,
    );
  }
}