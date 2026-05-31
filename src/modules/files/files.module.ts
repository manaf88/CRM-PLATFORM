import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { ContentPost } from '../content/entities/content-post.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { FileEntity } from './entities/file.entity';
import { PostAsset } from './entities/post-asset.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PostAssetsController } from './post-assets.controller';
import { PostAssetsService } from './post-assets.service';
import { StorageService } from './storage.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([FileEntity, PostAsset, ContentPost]),
    MembershipsModule,
  ],
  controllers: [
    FilesController,
    PostAssetsController,
  ],
  providers: [
    FilesService,
    PostAssetsService,
    StorageService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [
    FilesService,
    PostAssetsService,
  ],
})
export class FilesModule {}