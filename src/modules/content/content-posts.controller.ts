import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { ContentPostsService } from './content-posts.service';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { FindContentPostsQueryDto } from './dto/find-content-posts-query.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';
import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/posts')
export class ContentPostsController {
  constructor(
    private readonly contentPostsService: ContentPostsService,
  ) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateContentPostDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.contentPostsService.create(companyId, dto, currentUser);
  }

  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindContentPostsQueryDto,
  ) {
    return this.contentPostsService.findAll(companyId, query);
  }

  @Get(':postId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.contentPostsService.findOne(companyId, postId);
  }
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Patch(':postId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: UpdateContentPostDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.contentPostsService.update(
      companyId,
      postId,
      dto,
      currentUser,
    );
  }
}