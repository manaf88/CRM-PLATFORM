import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly membershipsService: MembershipsService,
  ) {}

  async create(
    dto: CreateCompanyDto,
    currentUser: RequestUser,
  ): Promise<Company> {
    const company = this.companiesRepository.create({
      name: dto.name.trim(),
      industry: dto.industry?.trim() ?? null,
      website: dto.website?.trim() ?? null,
      phone: dto.phone?.trim() ?? null,
      city: dto.city?.trim() ?? null,
      country: dto.country?.trim() ?? null,
      createdById: currentUser.id,
    });

    const savedCompany = await this.companiesRepository.save(company);

    await this.membershipsService.create({
      companyId: savedCompany.id,
      userId: currentUser.id,
      role: CompanyMembershipRole.ACCOUNT_MANAGER,
      invitedById: currentUser.id,
    });

    return savedCompany;
  }

  async findAllForUser(currentUser: RequestUser): Promise<Company[]> {
    if (
      currentUser.platformRole === PlatformRole.SUPER_ADMIN ||
      currentUser.platformRole === PlatformRole.AGENCY_ADMIN
    ) {
      return this.companiesRepository.find({
        order: {
          createdAt: 'DESC',
        },
      });
    }

    const memberships =
      await this.membershipsService.findActiveMembershipsForUser(
        currentUser.id,
      );

    return memberships.map((membership) => membership.company);
  }

  async findOneById(companyId: string): Promise<Company> {
    const company = await this.companiesRepository.findOne({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  async update(
    companyId: string,
    dto: UpdateCompanyDto,
  ): Promise<Company> {
    const company = await this.findOneById(companyId);

    if (dto.name !== undefined) {
      company.name = dto.name.trim();
    }

    if (dto.industry !== undefined) {
      company.industry = dto.industry?.trim() || null;
    }

    if (dto.website !== undefined) {
      company.website = dto.website?.trim() || null;
    }

    if (dto.phone !== undefined) {
      company.phone = dto.phone?.trim() || null;
    }

    if (dto.city !== undefined) {
      company.city = dto.city?.trim() || null;
    }

    if (dto.country !== undefined) {
      company.country = dto.country?.trim() || null;
    }

    if (dto.status !== undefined) {
      company.status = dto.status;
    }

    return this.companiesRepository.save(company);
  }
}