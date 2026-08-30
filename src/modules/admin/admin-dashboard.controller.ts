import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { AdminActivityService } from './admin-activity.service';
import { AdminAttentionService } from './admin-attention.service';
import { AdminDashboardService } from './admin-dashboard.service';
import {
  ActivityFilterDto,
  ContentPlanFilterDto,
  DashboardFilterDto,
  PaginatedDashboardFilterDto,
} from './dto/dashboard-filter.dto';

/**
 * Agency-wide operations dashboard.
 *
 * Open to both administrator roles — Super Admin and Admin see the same data.
 * No route takes a companyId: these endpoints aggregate across every client,
 * and `clientId` is a filter, not a scope. Employees and client users are
 * refused by the guard with a 403.
 */
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.AGENCY_ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly attentionService: AdminAttentionService,
    private readonly activityService: AdminActivityService,
  ) {}

  @Get('overview')
  getOverview(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getOverview(filters);
  }

  @Get('attention')
  getAttention(@Query() filters: PaginatedDashboardFilterDto) {
    return this.attentionService.getAttention(filters);
  }

  @Get('content')
  getContent(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getContent(filters);
  }

  @Get('approvals')
  getApprovals(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getApprovals(filters);
  }

  @Get('tasks')
  getTasks(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getTasks(filters);
  }

  @Get('team-workload')
  getTeamWorkload(@Query() filters: PaginatedDashboardFilterDto) {
    return this.dashboardService.getTeamWorkload(filters);
  }

  @Get('leads')
  getLeads(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getLeads(filters);
  }

  @Get('leads/overdue')
  getOverdueLeads(@Query() filters: PaginatedDashboardFilterDto) {
    return this.dashboardService.getOverdueLeadFollowUps(filters);
  }

  @Get('campaigns')
  getCampaigns(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getCampaigns(filters);
  }

  @Get('content-plans')
  getContentPlans(@Query() filters: ContentPlanFilterDto) {
    return this.dashboardService.getContentPlans(filters);
  }

  @Get('clients')
  getClients(@Query() filters: PaginatedDashboardFilterDto) {
    return this.dashboardService.getClients(filters);
  }

  @Get('automations')
  getAutomations(@Query() filters: DashboardFilterDto) {
    return this.dashboardService.getAutomations(filters);
  }

  @Get('activity')
  getActivity(@Query() filters: ActivityFilterDto) {
    return this.activityService.getActivity(filters);
  }
}
