import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
 * A "company" here is a *client* of Solutions (Al Zaman, Curby, Taxero…).
 * Solutions itself is the platform, not a row in this table.
 */
@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepository: Repository<Company>,
    private readonly membershipsService: MembershipsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
      roles: [CompanyMembershipRole.ACCOUNT_MANAGER],
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

  /**
   * Permanently delete a client and everything hanging off it. Super Admin only.
   *
   * This is not archiving — for a client that is merely finished, PATCH the
   * status to ARCHIVED instead. The caller must echo the client's exact name
   * back in `confirm`, so a delete cannot happen from a mistyped URL.
   *
   * Dependent rows go with the client through the ON DELETE CASCADE that every
   * client-scoped entity declares on its company relation. Uploaded objects in
   * S3/MinIO are deliberately left in place: their rows are gone, so nothing
   * can reach them, and reclaiming that storage is a separate, reversible
   * housekeeping job rather than part of an already destructive request.
   */
  async remove(
    companyId: string,
    confirm?: string,
  ): Promise<{
    deleted: true;
    clientId: string;
    clientName: string;
    removed: Record<string, number>;
  }> {
    const company = await this.findOneById(companyId);

    if (!confirm || confirm.trim() !== company.name) {
      throw new ConflictException(
        'Confirmation does not match the client name. Pass ?confirm=<exact client name> to delete.',
      );
    }

    const countable: Array<[string, string]> = [
      ['tasks', 'tasks'],
      ['posts', 'posts'],
      ['leads', 'leads'],
      ['campaigns', 'campaigns'],
      ['contentPlans', 'content_plans'],
      ['memberships', 'company_memberships'],
      ['files', 'files'],
    ];

    return this.dataSource.transaction(async (manager) => {
      const removed: Record<string, number> = {};

      for (const [label, table] of countable) {
        const rows = await manager.query<Array<{ count: number }>>(
          `SELECT COUNT(*)::int AS count FROM ${table} WHERE company_id = $1`,
          [companyId],
        );

        removed[label] = rows[0]?.count ?? 0;
      }

      try {
        await manager.delete(Company, { id: companyId });
      } catch (error) {
        // A foreign key that was not created with ON DELETE CASCADE is the one
        // way this fails. Say so plainly instead of surfacing a driver error.
        this.logger.error(
          `Deleting client ${companyId} failed: ${String(error)}`,
        );

        throw new InternalServerErrorException(
          'Client could not be deleted because related records still reference it. Check the foreign keys on this database.',
        );
      }

      this.logger.warn(
        `Client ${company.name} (${companyId}) permanently deleted: ${JSON.stringify(removed)}`,
      );

      return {
        deleted: true as const,
        clientId: companyId,
        clientName: company.name,
        removed,
      };
    });
  }
}
