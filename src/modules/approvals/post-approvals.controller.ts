import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { AddPostCommentDto } from './dto/add-post-comment.dto';
import { PostApprovalNoteDto } from './dto/post-approval-note.dto';
import { PublishPostDto } from './dto/publish-post.dto';
import { PostApprovalsService } from './post-approvals.service';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/posts/:postId')
export class PostApprovalsController {
  constructor(
    private readonly postApprovalsService: PostApprovalsService,
  ) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
)
  @Post('comments')
  addComment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: AddPostCommentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.addComment(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }

  @Get('comments')
  findComments(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.postApprovalsService.findComments(companyId, postId);
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Post('submit-review')
  submitToClient(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: PostApprovalNoteDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.submitToClient(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.ACCOUNT_MANAGER,
)
  @Post('approve')
  approve(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: PostApprovalNoteDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.approve(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.ACCOUNT_MANAGER,
)
  @Post('request-changes')
  requestChanges(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: PostApprovalNoteDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.requestChanges(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }

  @Post('reject')
  reject(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: PostApprovalNoteDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.reject(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Post('publish')
  publish(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: PublishPostDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.postApprovalsService.publish(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }

  @Get('approval-logs')
  findApprovalLogs(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.postApprovalsService.findApprovalLogs(companyId, postId);
  }
}