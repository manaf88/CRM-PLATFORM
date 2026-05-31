import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CreateMonthlyReportDto } from './dto/create-monthly-report.dto';
import { ReportOverviewQueryDto } from './dto/report-overview-query.dto';
import { ReportsService } from './reports.service';
import { CompanyRoles } from 'src/common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from 'src/common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.CLIENT_OWNER,
)
  @Get('overview')
  getOverview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: ReportOverviewQueryDto,
  ) {
    return this.reportsService.getOverview(companyId, query);
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
)
  @Post('monthly')
  createMonthlyReport(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateMonthlyReportDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.reportsService.createMonthlyReport(
      companyId,
      dto,
      currentUser,
    );
  }

  @Get()
  findAll(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.reportsService.findAll(companyId);
  }

  @Get(':reportId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reportsService.findOne(companyId, reportId);
  }
}