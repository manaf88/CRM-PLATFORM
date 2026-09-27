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
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { AttachmentEntityType } from './enums/attachment-entity-type.enum';

const INTERNAL_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
];

// Only on posts. A client never sees the files hanging off a lead, a
// campaign, a task or the brand profile — those are the agency's own working
// material.
const POST_READ_ROLES = [
  ...INTERNAL_ROLES,
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
];

/**
 * The same three routes on five parents.
 *
 * Each controller does nothing but name its entity type; every rule — the
 * tenant check, the limits, who may delete — lives once in the service.
 */
abstract class BaseAttachmentsController {
  protected constructor(
    protected readonly attachmentsService: AttachmentsService,
    protected readonly entityType: AttachmentEntityType,
  ) {}

  protected list(companyId: string, entityId: string) {
    return this.attachmentsService.list(companyId, this.entityType, entityId);
  }

  protected add(
    companyId: string,
    entityId: string,
    dto: CreateAttachmentDto,
    currentUser: RequestUser,
  ) {
    return this.attachmentsService.add(
      companyId,
      this.entityType,
      entityId,
      dto,
      currentUser,
    );
  }

  protected remove(
    companyId: string,
    entityId: string,
    attachmentId: string,
    currentUser: RequestUser,
  ) {
    return this.attachmentsService.remove(
      companyId,
      this.entityType,
      entityId,
      attachmentId,
      currentUser,
    );
  }
}

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/tasks/:taskId/attachments')
export class TaskAttachmentsController extends BaseAttachmentsController {
  constructor(attachmentsService: AttachmentsService) {
    super(attachmentsService, AttachmentEntityType.TASK);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.list(companyId, taskId);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.add(companyId, taskId, dto, currentUser);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':attachmentId')
  delete(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.remove(companyId, taskId, attachmentId, currentUser);
  }
}

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/posts/:postId/attachments')
export class PostAttachmentsController extends BaseAttachmentsController {
  constructor(attachmentsService: AttachmentsService) {
    super(attachmentsService, AttachmentEntityType.POST);
  }

  @CompanyRoles(...POST_READ_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.list(companyId, postId);
  }

  @CompanyRoles(
    CompanyMembershipRole.ACCOUNT_MANAGER,
    CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
    CompanyMembershipRole.DESIGNER,
    CompanyMembershipRole.COPYWRITER,
  )
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.add(companyId, postId, dto, currentUser);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':attachmentId')
  delete(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.remove(companyId, postId, attachmentId, currentUser);
  }
}

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/campaigns/:campaignId/attachments')
export class CampaignAttachmentsController extends BaseAttachmentsController {
  constructor(attachmentsService: AttachmentsService) {
    super(attachmentsService, AttachmentEntityType.CAMPAIGN);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.list(companyId, campaignId);
  }

  @CompanyRoles(
    CompanyMembershipRole.ACCOUNT_MANAGER,
    CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  )
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.add(companyId, campaignId, dto, currentUser);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':attachmentId')
  delete(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.remove(companyId, campaignId, attachmentId, currentUser);
  }
}

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/leads/:leadId/attachments')
export class LeadAttachmentsController extends BaseAttachmentsController {
  constructor(attachmentsService: AttachmentsService) {
    super(attachmentsService, AttachmentEntityType.LEAD);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ) {
    return this.list(companyId, leadId);
  }

  @CompanyRoles(
    CompanyMembershipRole.ACCOUNT_MANAGER,
    CompanyMembershipRole.SALES_AGENT,
  )
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.add(companyId, leadId, dto, currentUser);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':attachmentId')
  delete(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.remove(companyId, leadId, attachmentId, currentUser);
  }
}

/**
 * The brand profile is one row per client with no id in its URL, so the
 * company stands in for the entity id and the service resolves it.
 */
@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/brand-profile/attachments')
export class BrandProfileAttachmentsController extends BaseAttachmentsController {
  constructor(attachmentsService: AttachmentsService) {
    super(attachmentsService, AttachmentEntityType.BRAND_PROFILE);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @Get()
  findAll(@Param('companyId', ParseUUIDPipe) companyId: string) {
    return this.list(companyId, companyId);
  }

  @CompanyRoles(
    CompanyMembershipRole.ACCOUNT_MANAGER,
    CompanyMembershipRole.DESIGNER,
  )
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateAttachmentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.add(companyId, companyId, dto, currentUser);
  }

  @CompanyRoles(...INTERNAL_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':attachmentId')
  delete(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.remove(companyId, companyId, attachmentId, currentUser);
  }
}
