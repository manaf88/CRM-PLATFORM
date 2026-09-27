import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { FilesService } from './files.service';
import { CompanyRoles } from 'src/common/decorators/company-roles.decorator';
import { CompanyRolesGuard } from 'src/common/guards/company-roles.guard';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}
  @UseGuards(CompanyRolesGuard)
  // Every internal role uploads: a copywriter attaches a brief, a sales agent
  // attaches the screenshot a lead sent them. Client roles are left out — they
  // read attachments on posts, they do not add them.
  @CompanyRoles(
    CompanyMembershipRole.ACCOUNT_MANAGER,
    CompanyMembershipRole.COPYWRITER,
    CompanyMembershipRole.DESIGNER,
    CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
    CompanyMembershipRole.SALES_AGENT,
  )
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  uploadFile(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.filesService.uploadCompanyFile(companyId, file, currentUser);
  }

  @Get(':fileId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.filesService.findOne(companyId, fileId);
  }

  @Get(':fileId/download-url')
  getDownloadUrl(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query('disposition') disposition?: string,
  ) {
    return this.filesService.getDownloadUrl(
      companyId,
      fileId,
      disposition === 'inline' ? 'inline' : 'attachment',
    );
  }
}
