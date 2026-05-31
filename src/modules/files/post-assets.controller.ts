import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AttachPostAssetDto } from './dto/attach-post-asset.dto';
import { PostAssetsService } from './post-assets.service';
import { CompanyRoles } from 'src/common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from 'src/common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/posts/:postId/assets')
export class PostAssetsController {
  constructor(private readonly postAssetsService: PostAssetsService) {}
@UseGuards(CompanyRolesGuard)
@CompanyRoles(
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
)
  @Post()
  attachFileToPost(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: AttachPostAssetDto,
  ) {
    return this.postAssetsService.attachFileToPost(
      companyId,
      postId,
      dto,
    );
  }

  @Get()
  findPostAssets(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.postAssetsService.findPostAssets(companyId, postId);
  }

  @Delete(':assetId')
  removePostAsset(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.postAssetsService.removePostAsset(
      companyId,
      postId,
      assetId,
    );
  }
}