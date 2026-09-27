import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { ReportSharesService } from './report-shares.service';
import { ReportsService } from './reports.service';
import { CompanyRoles } from 'src/common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from 'src/common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly sharesService: ReportSharesService,
  ) {}
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
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @Post('monthly')
  createMonthlyReport(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateMonthlyReportDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.reportsService.createMonthlyReport(companyId, dto, currentUser);
  }

  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @Post(':reportId/share')
  share(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Query('rotate') rotate: string | undefined,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.sharesService.share(
      companyId,
      reportId,
      currentUser,
      rotate === 'true',
    );
  }
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @Get(':reportId/share')
  findShare(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.sharesService.findShare(companyId, reportId);
  }
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyMembershipRole.ACCOUNT_MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':reportId/share')
  revoke(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.sharesService.revoke(companyId, reportId, currentUser);
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
