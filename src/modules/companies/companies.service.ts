import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';

/**
 * Fixed key for the advisory lock that serialises first-time creation of the
 * shared workspace, so two simultaneous sign-ups cannot each create one and
 * split accounts across two companies.
 */
const DEFAULT_COMPANY_LOCK_KEY = 4820113;

@Injectable()
export class CompaniesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CompaniesService.name);
  private cachedDefaultCompanyId: string | null = null;

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly membershipsService: MembershipsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const company = await this.ensureDefaultCompany();

      this.logger.log(
        `Shared workspace ready: "${company.name}" (${company.id})`,
      );
    } catch (error) {
      // Never block startup on this — sign-up retries it per account.
      this.logger.error(
        `Could not prepare the shared workspace: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The single company every account belongs to. Found by configured id, or
   * found-and-created-once by configured name. Safe to call repeatedly.
   */
  async ensureDefaultCompany(): Promise<Company> {
    if (this.cachedDefaultCompanyId) {
      const cachedCompany = await this.companiesRepository.findOne({
        where: {
          id: this.cachedDefaultCompanyId,
        },
      });

      if (cachedCompany) {
        return cachedCompany;
      }

      // The company was removed — fall through and resolve it again.
      this.cachedDefaultCompanyId = null;
    }

    const configuredId = this.configService.get<string | null>(
      'workspace.defaultCompanyId',
    );

    if (configuredId) {
      const configuredCompany = await this.companiesRepository.findOne({
        where: {
          id: configuredId,
        },
      });

      if (!configuredCompany) {
        throw new Error(
          `DEFAULT_COMPANY_ID (${configuredId}) does not match any company`,
        );
      }

      this.cachedDefaultCompanyId = configuredCompany.id;

      return configuredCompany;
    }

    const name =
      this.configService.get<string>('workspace.defaultCompanyName') ??
      'Solutions';

    const company = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [
        DEFAULT_COMPANY_LOCK_KEY,
      ]);

      const repository = manager.getRepository(Company);

      const existingCompany = await repository.findOne({
        where: {
          name,
        },
      });

      if (existingCompany) {
        return existingCompany;
      }

      this.logger.log(`Creating the shared workspace "${name}"`);

      return repository.save(
        repository.create({
          name,
          createdById: null,
        }),
      );
    });

    this.cachedDefaultCompanyId = company.id;

    return company;
  }

  /**
   * Place an account in the shared workspace. This is what replaces the
   * "create company" step: by the time the dashboard loads, the user already
   * has a workspace.
   */
  async ensureDefaultMembership(userId: string): Promise<Company> {
    const company = await this.ensureDefaultCompany();

    const role =
      this.configService.get<CompanyMembershipRole>(
        'workspace.defaultMemberRole',
      ) ?? CompanyMembershipRole.ACCOUNT_MANAGER;

    await this.membershipsService.ensureMembership({
      companyId: company.id,
      userId,
      role,
    });

    return company;
  }

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