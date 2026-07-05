import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CreateResponsibilityAreaDto } from './dto/create-responsibility-area.dto';
import { FindResponsibilityAreasQueryDto } from './dto/find-responsibility-areas-query.dto';
import { UpdateResponsibilityAreaDto } from './dto/update-responsibility-area.dto';
import { ResponsibilityArea } from './entities/responsibility-area.entity';

@Injectable()
export class ResponsibilityAreasService {
  constructor(
    @InjectRepository(ResponsibilityArea)
    private readonly areasRepository: Repository<ResponsibilityArea>,
  ) {}

  async create(
    companyId: string,
    dto: CreateResponsibilityAreaDto,
    currentUser: RequestUser,
  ): Promise<ResponsibilityArea> {
    const name = dto.name.trim();

    await this.assertNameAvailable(companyId, name);

    const area = this.areasRepository.create({
      companyId,
      name,
      description: this.cleanOptionalString(dto.description),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      createdById: currentUser.id,
      updatedById: currentUser.id,
    });

    return this.areasRepository.save(area);
  }

  async findAll(companyId: string, query: FindResponsibilityAreasQueryDto) {
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const qb = this.areasRepository
      .createQueryBuilder('area')
      .where('area.companyId = :companyId', { companyId });

    if (query.isActive !== undefined) {
      qb.andWhere('area.isActive = :isActive', { isActive: query.isActive });
    }

    if (query.search) {
      const search = `%${query.search.trim()}%`;

      qb.andWhere(
        new Brackets((innerQb) => {
          innerQb
            .where('area.name ILIKE :search', { search })
            .orWhere('area.description ILIKE :search', { search });
        }),
      );
    }

    qb.orderBy('area.sortOrder', 'ASC')
      .addOrderBy('area.name', 'ASC')
      .take(limit)
      .skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, limit, offset };
  }

  async findOne(
    companyId: string,
    areaId: string,
  ): Promise<ResponsibilityArea> {
    const area = await this.areasRepository.findOne({
      where: { id: areaId, companyId },
    });

    if (!area) {
      throw new NotFoundException('Responsibility area not found');
    }

    return area;
  }

  async update(
    companyId: string,
    areaId: string,
    dto: UpdateResponsibilityAreaDto,
    currentUser: RequestUser,
  ): Promise<ResponsibilityArea> {
    const area = await this.findOne(companyId, areaId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      if (name.toLowerCase() !== area.name.toLowerCase()) {
        await this.assertNameAvailable(companyId, name, areaId);
      }

      area.name = name;
    }

    if (dto.description !== undefined) {
      area.description = this.cleanOptionalString(dto.description);
    }

    if (dto.sortOrder !== undefined) {
      area.sortOrder = dto.sortOrder;
    }

    if (dto.isActive !== undefined) {
      area.isActive = dto.isActive;
    }

    area.updatedById = currentUser.id;

    return this.areasRepository.save(area);
  }

  /**
   * All active areas for a company, ordered for grid rendering.
   * Unpaginated on purpose — the matrix needs every row.
   */
  async listActiveForMatrix(
    companyId: string,
  ): Promise<ResponsibilityArea[]> {
    return this.areasRepository.find({
      where: { companyId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Returns the subset of the given ids that exist within the company.
   * Used for fast, aggregated validation of bulk payloads.
   */
  async findExistingIds(
    companyId: string,
    areaIds: string[],
  ): Promise<Set<string>> {
    if (areaIds.length === 0) {
      return new Set();
    }

    const rows = await this.areasRepository
      .createQueryBuilder('area')
      .select('area.id', 'id')
      .where('area.companyId = :companyId', { companyId })
      .andWhere('area.id IN (:...areaIds)', { areaIds })
      .getRawMany<{ id: string }>();

    return new Set(rows.map((row) => row.id));
  }

  async remove(
    companyId: string,
    areaId: string,
  ): Promise<{ success: true }> {
    const area = await this.findOne(companyId, areaId);

    // Assignments for this area are removed via ON DELETE CASCADE.
    await this.areasRepository.remove(area);

    return { success: true };
  }

  private async assertNameAvailable(
    companyId: string,
    name: string,
    excludeAreaId?: string,
  ): Promise<void> {
    const qb = this.areasRepository
      .createQueryBuilder('area')
      .where('area.companyId = :companyId', { companyId })
      .andWhere('LOWER(area.name) = LOWER(:name)', { name });

    if (excludeAreaId) {
      qb.andWhere('area.id != :excludeAreaId', { excludeAreaId });
    }

    const existing = await qb.getOne();

    if (existing) {
      throw new ConflictException(
        `A responsibility area named "${name}" already exists`,
      );
    }
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }
}