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
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { FindCampaignsQueryDto } from './dto/find-campaigns-query.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const CAMPAIGN_VIEW_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.SALES_AGENT,
];

const CAMPAIGN_MANAGE_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
];

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateCampaignDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.campaignsService.create(companyId, dto, currentUser);
  }

  @CompanyRoles(...CAMPAIGN_VIEW_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindCampaignsQueryDto,
  ) {
    return this.campaignsService.findAll(companyId, query);
  }

  @CompanyRoles(...CAMPAIGN_VIEW_ROLES)
  @Get(':campaignId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.campaignsService.findOne(companyId, campaignId);
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Patch(':campaignId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.campaignsService.update(
      companyId,
      campaignId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Patch(':campaignId/status')
  updateStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: UpdateCampaignStatusDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.campaignsService.updateStatus(
      companyId,
      campaignId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...CAMPAIGN_VIEW_ROLES)
  @Get(':campaignId/overview')
  getOverview(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.campaignsService.getOverview(companyId, campaignId);
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Post(':campaignId/posts/:postId')
  attachPost(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.campaignsService.attachPost(
      companyId,
      campaignId,
      postId,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Delete(':campaignId/posts/:postId')
  detachPost(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.campaignsService.detachPost(
      companyId,
      campaignId,
      postId,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Post(':campaignId/leads/:leadId')
  attachLead(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.campaignsService.attachLead(
      companyId,
      campaignId,
      leadId,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Delete(':campaignId/leads/:leadId')
  detachLead(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.campaignsService.detachLead(
      companyId,
      campaignId,
      leadId,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Post(':campaignId/tasks/:taskId')
  attachTask(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.campaignsService.attachTask(
      companyId,
      campaignId,
      taskId,
    );
  }

  @CompanyRoles(...CAMPAIGN_MANAGE_ROLES)
  @Delete(':campaignId/tasks/:taskId')
  detachTask(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.campaignsService.detachTask(
      companyId,
      campaignId,
      taskId,
    );
  }
}