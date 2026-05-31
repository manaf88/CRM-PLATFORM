import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { BrandProfilesService } from './brand-profiles.service';
import { CreateBrandProfileDto } from './dto/create-brand-profile.dto';
import { UpdateBrandProfileDto } from './dto/update-brand-profile.dto';

@UseGuards(JwtAuthGuard, CompanyAccessGuard)
@Controller('companies/:companyId/brand-profile')
export class BrandProfilesController {
  constructor(
    private readonly brandProfilesService: BrandProfilesService,
  ) {}

  @Post()
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateBrandProfileDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.brandProfilesService.create(
      companyId,
      dto,
      currentUser,
    );
  }

  @Get()
  findOne(@Param('companyId') companyId: string) {
    return this.brandProfilesService.findByCompanyId(companyId);
  }

  @Patch()
  update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateBrandProfileDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.brandProfilesService.update(
      companyId,
      dto,
      currentUser,
    );
  }
}