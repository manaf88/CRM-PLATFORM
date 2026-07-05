import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { User } from '../users/entities/user.entity';
import { AssignResponsibilityDto } from './dto/assign-responsibility.dto';
import { BulkAssignResponsibilitiesDto } from './dto/bulk-assign-responsibilities.dto';
import { FindResponsibilityAssignmentsQueryDto } from './dto/find-responsibility-assignments-query.dto';
import { UpdateResponsibilityAssignmentDto } from './dto/update-responsibility-assignment.dto';
import { ResponsibilityAssignment } from './entities/responsibility-assignment.entity';
import { ResponsibilityType } from './enums/responsibility-type.enum';
import { ResponsibilityAreasService } from './responsibility-areas.service';

/**
 * Only internal/staff roles can hold delivery responsibilities.
 * Client-side roles are intentionally excluded from the matrix.
 */
const ASSIGNABLE_MEMBER_ROLES: CompanyMembershipRole[] = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
];

@Injectable()
export class ResponsibilityAssignmentsService {
  constructor(
    @InjectRepository(ResponsibilityAssignment)
    private readonly assignmentsRepository: Repository<ResponsibilityAssignment>,

    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    private readonly dataSource: DataSource,
    private readonly areasService: ResponsibilityAreasService,
    private readonly membershipsService: MembershipsService,
  ) {}

  /**
   * Upsert a single matrix cell. If the (area, member) cell already exists
   * its responsibility is updated; otherwise a new cell is created.
   */
  async assign(
    companyId: string,
    dto: AssignResponsibilityDto,
    currentUser: RequestUser,
  ): Promise<ResponsibilityAssignment> {
    await this.areasService.findOne(companyId, dto.areaId);
    await this.assertAssignableMember(companyId, dto.memberUserId);

    const customLabel = this.resolveCustomLabel(dto.type, dto.customLabel);
    const note = this.cleanOptionalString(dto.note);

    const existing = await this.assignmentsRepository.findOne({
      where: {
        companyId,
        areaId: dto.areaId,
        memberUserId: dto.memberUserId,
      },
    });

    if (existing) {
      existing.type = dto.type;
      existing.customLabel = customLabel;
      existing.note = note;
      existing.updatedById = currentUser.id;

      const saved = await this.assignmentsRepository.save(existing);

      return this.findOne(companyId, saved.id);
    }

    const assignment = this.assignmentsRepository.create({
      companyId,
      areaId: dto.areaId,
      memberUserId: dto.memberUserId,
      type: dto.type,
      customLabel,
      note,
      assignedById: currentUser.id,
      updatedById: currentUser.id,
    });

    try {
      const saved = await this.assignmentsRepository.save(assignment);

      return this.findOne(companyId, saved.id);
    } catch (error) {
      // Lost a concurrent insert race on the unique cell: reload and update
      // instead of surfacing a raw 500. Safe here because this path is not
      // inside a transaction (unlike bulkAssign).
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const current = await this.assignmentsRepository.findOne({
        where: {
          companyId,
          areaId: dto.areaId,
          memberUserId: dto.memberUserId,
        },
      });

      if (!current) {
        throw error;
      }

      current.type = dto.type;
      current.customLabel = customLabel;
      current.note = note;
      current.updatedById = currentUser.id;

      const saved = await this.assignmentsRepository.save(current);

      return this.findOne(companyId, saved.id);
    }
  }

  /**
   * Upsert many cells atomically — used by the grid "save" action.
   * Validates the whole payload up front and rolls back on any failure.
   */
  async bulkAssign(
    companyId: string,
    dto: BulkAssignResponsibilitiesDto,
    currentUser: RequestUser,
  ): Promise<{ created: number; updated: number; total: number }> {
    this.assertNoDuplicateCells(dto.items);

    const areaIds = [...new Set(dto.items.map((item) => item.areaId))];
    const memberUserIds = [
      ...new Set(dto.items.map((item) => item.memberUserId)),
    ];

    await this.assertAreasExist(companyId, areaIds);
    await this.assertAssignableMembers(companyId, memberUserIds);

    let created = 0;
    let updated = 0;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ResponsibilityAssignment);

      for (const item of dto.items) {
        const customLabel = this.resolveCustomLabel(
          item.type,
          item.customLabel,
        );
        const note = this.cleanOptionalString(item.note);

        const existing = await repo.findOne({
          where: {
            companyId,
            areaId: item.areaId,
            memberUserId: item.memberUserId,
          },
        });

        if (existing) {
          existing.type = item.type;
          existing.customLabel = customLabel;
          existing.note = note;
          existing.updatedById = currentUser.id;

          await repo.save(existing);
          updated += 1;
          continue;
        }

        const assignment = repo.create({
          companyId,
          areaId: item.areaId,
          memberUserId: item.memberUserId,
          type: item.type,
          customLabel,
          note,
          assignedById: currentUser.id,
          updatedById: currentUser.id,
        });

        await repo.save(assignment);
        created += 1;
      }
    });

    return { created, updated, total: dto.items.length };
  }

  async findAll(
    companyId: string,
    query: FindResponsibilityAssignmentsQueryDto,
  ) {
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const qb = this.assignmentsRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.area', 'area')
      .leftJoinAndSelect('assignment.memberUser', 'memberUser')
      .where('assignment.companyId = :companyId', { companyId });

    if (query.areaId) {
      qb.andWhere('assignment.areaId = :areaId', { areaId: query.areaId });
    }

    if (query.memberUserId) {
      qb.andWhere('assignment.memberUserId = :memberUserId', {
        memberUserId: query.memberUserId,
      });
    }

    if (query.type) {
      qb.andWhere('assignment.type = :type', { type: query.type });
    }

    qb.orderBy('area.sortOrder', 'ASC')
      .addOrderBy('memberUser.fullName', 'ASC')
      .take(limit)
      .skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, limit, offset };
  }

async findOne(
  companyId: string,
  assignmentId: string,
): Promise<ResponsibilityAssignment> {
  const assignment = await this.assignmentsRepository.findOne({
    where: { id: assignmentId, companyId },
    relations: { area: true, memberUser: true },
  });

  if (!assignment) {
    throw new NotFoundException('Responsibility assignment not found');
  }

  return assignment;
}

  async update(
    companyId: string,
    assignmentId: string,
    dto: UpdateResponsibilityAssignmentDto,
    currentUser: RequestUser,
  ): Promise<ResponsibilityAssignment> {
    const assignment = await this.findOne(companyId, assignmentId);

    const nextType = dto.type ?? assignment.type;

    if (dto.type !== undefined || dto.customLabel !== undefined) {
      const nextLabelInput =
        dto.customLabel !== undefined ? dto.customLabel : assignment.customLabel;

      assignment.customLabel = this.resolveCustomLabel(
        nextType,
        nextLabelInput ?? undefined,
      );
    }

    if (dto.type !== undefined) {
      assignment.type = dto.type;
    }

    if (dto.note !== undefined) {
      assignment.note = this.cleanOptionalString(dto.note);
    }

    assignment.updatedById = currentUser.id;

    await this.assignmentsRepository.save(assignment);

    return this.findOne(companyId, assignmentId);
  }

  async remove(
    companyId: string,
    assignmentId: string,
  ): Promise<{ success: true }> {
    const assignment = await this.findOne(companyId, assignmentId);

    await this.assignmentsRepository.remove(assignment);

    return { success: true };
  }

  /**
   * The full grid: active areas (rows) x assignable members (columns) with a
   * flat list of populated cells. Returned normalised so the frontend can
   * build a `cells[areaId][memberUserId]` lookup cheaply.
   */
  async getMatrix(companyId: string) {
    const [areas, memberships] = await Promise.all([
      this.areasService.listActiveForMatrix(companyId),
      this.membershipsService.findActiveMembersByRoles(
        companyId,
        ASSIGNABLE_MEMBER_ROLES,
      ),
    ]);

    const memberUserIds = memberships.map((m) => m.userId);
    const roleByUserId = new Map(
      memberships.map((m) => [m.userId, m.role] as const),
    );

    const users = memberUserIds.length
      ? await this.usersRepository.find({
          where: { id: In(memberUserIds) },
        })
      : [];

    const members = users
      .map((user) => ({
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: roleByUserId.get(user.id) ?? null,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const areaIds = new Set(areas.map((area) => area.id));
    const memberIdSet = new Set(memberUserIds);

    const assignments = await this.assignmentsRepository.find({
      where: { companyId },
    });

    const cells = assignments
      .filter(
        (a) => areaIds.has(a.areaId) && memberIdSet.has(a.memberUserId),
      )
      .map((a) => ({
        assignmentId: a.id,
        areaId: a.areaId,
        memberUserId: a.memberUserId,
        type: a.type,
        customLabel: a.customLabel,
        note: a.note,
      }));

    return {
      areas: areas.map((area) => ({
        id: area.id,
        name: area.name,
        sortOrder: area.sortOrder,
      })),
      members,
      cells,
    };
  }

  private async assertAssignableMember(
    companyId: string,
    memberUserId: string,
  ): Promise<void> {
    const membership = await this.membershipsService.findActiveMembership(
      memberUserId,
      companyId,
    );

    if (!membership) {
      throw new BadRequestException(
        'Target user is not an active member of this company',
      );
    }

    if (!ASSIGNABLE_MEMBER_ROLES.includes(membership.role)) {
      throw new BadRequestException(
        `Members with role ${membership.role} cannot receive responsibilities`,
      );
    }
  }

  private async assertAssignableMembers(
    companyId: string,
    memberUserIds: string[],
  ): Promise<void> {
    const results = await Promise.all(
      memberUserIds.map(async (userId) => ({
        userId,
        membership: await this.membershipsService.findActiveMembership(
          userId,
          companyId,
        ),
      })),
    );

    const invalid = results.filter(
      ({ membership }) =>
        !membership || !ASSIGNABLE_MEMBER_ROLES.includes(membership.role),
    );

    if (invalid.length > 0) {
      const ids = invalid.map((entry) => entry.userId).join(', ');

      throw new BadRequestException(
        `These users cannot receive responsibilities (not an active assignable member): ${ids}`,
      );
    }
  }

  private async assertAreasExist(
    companyId: string,
    areaIds: string[],
  ): Promise<void> {
    const existing = await this.areasService.findExistingIds(
      companyId,
      areaIds,
    );

    const missing = areaIds.filter((id) => !existing.has(id));

    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown responsibility area(s): ${missing.join(', ')}`,
      );
    }
  }

  private assertNoDuplicateCells(items: AssignResponsibilityDto[]): void {
    const seen = new Set<string>();

    for (const item of items) {
      const key = `${item.areaId}:${item.memberUserId}`;

      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate cell in payload: each (areaId, memberUserId) pair may appear only once',
        );
      }

      seen.add(key);
    }
  }

  /**
   * A custom label is only kept for OTHER. It is required there and cleared
   * for every other type. DTO validation already guarantees presence for
   * OTHER; this is the defensive server-side normalisation.
   */
  private resolveCustomLabel(
    type: ResponsibilityType,
    customLabel?: string,
  ): string | null {
    if (type !== ResponsibilityType.OTHER) {
      return null;
    }

    const cleaned = customLabel?.trim();

    if (!cleaned) {
      throw new BadRequestException(
        'customLabel is required when type is OTHER',
      );
    }

    return cleaned;
  }

  private cleanOptionalString(value?: string): string | null {
    if (value === undefined) {
      return null;
    }

    const cleaned = value.trim();

    return cleaned.length > 0 ? cleaned : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}