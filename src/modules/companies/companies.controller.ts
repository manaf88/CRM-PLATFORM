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
import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @UseGuards(PlatformRolesGuard)
  @PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.AGENCY_ADMIN)
  @Post()
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.companiesService.create(dto, currentUser);
  }

  @Get()
  findAll(@CurrentUser() currentUser: RequestUser) {
    return this.companiesService.findAllForUser(currentUser);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(':companyId')
  findOne(@Param('companyId') companyId: string) {
    return this.companiesService.findOneById(companyId);
  }

  @UseGuards(CompanyAccessGuard)
  @Patch(':companyId')
  update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(companyId, dto);
  }
}