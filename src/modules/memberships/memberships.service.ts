import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CompanyMembership } from './entities/company-membership.entity';
import { CompanyMembershipRole } from './enums/company-membership-role.enum';
import { CompanyMembershipStatus } from './enums/company-membership-status.enum';

type CreateMembershipInput = {
  companyId: string;
  userId: string;
  /** One or more roles this person holds on the client. */
  roles: CompanyMembershipRole[];
  invitedById?: string | null;
};

/**
 * Duplicate roles are meaningless and an empty list would leave somebody on a
 * client with no permissions at all, so both are refused at the door.
 */
function normalizeRoles(
  roles: CompanyMembershipRole[],
): CompanyMembershipRole[] {
  const unique = [...new Set(roles)];

  if (unique.length === 0) {
    throw new BadRequestException('At least one role is required');
  }

  return unique;
}

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepository: Repository<CompanyMembership>,
  ) {}

  async create(input: CreateMembershipInput): Promise<CompanyMembership> {
    const existingMembership = await this.membershipsRepository.findOne({
      where: {
        companyId: input.companyId,
        userId: input.userId,
      },
    });

    if (existingMembership) {
      throw new ConflictException('User is already a member of this company');
    }

    const roles = normalizeRoles(input.roles);

    const membership = this.membershipsRepository.create({
      companyId: input.companyId,
      userId: input.userId,
      // `role` mirrors the first entry so the legacy column stays meaningful.
      role: roles[0],
      roles,
      status: CompanyMembershipStatus.ACTIVE,
      invitedById: input.invitedById ?? null,
    });

    return this.membershipsRepository.save(membership);
  }

  /**
   * Put an employee on a client. Re-assigning somebody who was taken off that
   * client before reactivates their existing membership with the new role,
   * which keeps their history rather than starting a second one.
   */
  async assignToCompany(
    input: CreateMembershipInput,
  ): Promise<CompanyMembership> {
    const existingMembership = await this.findByUserAndCompany(
      input.userId,
      input.companyId,
    );

    if (!existingMembership) {
      return this.create(input);
    }

    if (existingMembership.status === CompanyMembershipStatus.ACTIVE) {
      throw new ConflictException('This employee already works on this client');
    }

    const roles = normalizeRoles(input.roles);

    existingMembership.role = roles[0];
    existingMembership.roles = roles;
    existingMembership.status = CompanyMembershipStatus.ACTIVE;

    return this.membershipsRepository.save(existingMembership);
  }

  /**
   * Active memberships for many users at once, so listing employees with the
   * clients they work on stays a single query.
   */
  async findActiveMembershipsForUsers(
    userIds: string[],
  ): Promise<CompanyMembership[]> {
    if (userIds.length === 0) {
      return [];
    }

    return this.membershipsRepository.find({
      where: {
        userId: In(userIds),
        status: CompanyMembershipStatus.ACTIVE,
      },
      relations: {
        company: true,
      },
    });
  }

  async existsActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const count = await this.membershipsRepository.count({
      where: {
        userId,
        companyId,
        status: CompanyMembershipStatus.ACTIVE,
      },
    });

    return count > 0;
  }

  async findActiveMembershipsForUser(
    userId: string,
  ): Promise<CompanyMembership[]> {
    return this.membershipsRepository.find({
      where: {
        userId,
        status: CompanyMembershipStatus.ACTIVE,
      },
      relations: {
        company: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership | null> {
    return this.membershipsRepository.findOne({
      where: {
        userId,
        companyId,
        status: CompanyMembershipStatus.ACTIVE,
      },
    });
  }

  /**
   * Every role this person holds on this client. Empty when they are not an
   * active member — the caller cannot tell those apart from a member with no
   * roles, because that state is not allowed to exist.
   */
  async findActiveMembershipRoles(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembershipRole[]> {
    const membership = await this.membershipsRepository.findOne({
      where: {
        userId,
        companyId,
        status: CompanyMembershipStatus.ACTIVE,
      },
    });

    return membership?.effectiveRoles ?? [];
  }

  async findByUserAndCompany(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembership | null> {
    return this.membershipsRepository.findOne({
      where: {
        userId,
        companyId,
      },
    });
  }
  async findAllByCompany(companyId: string): Promise<CompanyMembership[]> {
    return this.membershipsRepository.find({
      where: {
        companyId,
      },
      relations: {
        user: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }
  async findOneByIdForCompany(
    companyId: string,
    membershipId: string,
  ): Promise<CompanyMembership | null> {
    return this.membershipsRepository.findOne({
      where: {
        id: membershipId,
        companyId,
      },
      relations: {
        user: true,
      },
    });
  }
  async updateMembership(
    companyId: string,
    membershipId: string,
    input: {
      roles?: CompanyMembershipRole[];
      status?: CompanyMembershipStatus;
    },
  ): Promise<CompanyMembership> {
    const membership = await this.findOneByIdForCompany(
      companyId,
      membershipId,
    );

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (input.roles !== undefined) {
      const roles = normalizeRoles(input.roles);

      membership.role = roles[0];
      membership.roles = roles;
    }

    if (input.status !== undefined) {
      membership.status = input.status;
    }

    return this.membershipsRepository.save(membership);
  }
  async deactivateMembership(
    companyId: string,
    membershipId: string,
  ): Promise<{ success: true }> {
    const membership = await this.findOneByIdForCompany(
      companyId,
      membershipId,
    );

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    membership.status = CompanyMembershipStatus.SUSPENDED;

    await this.membershipsRepository.save(membership);

    return { success: true };
  }
  /**
   * Active members holding any of the given roles. `&&` is Postgres array
   * overlap, so somebody who is both Designer and Copywriter is found by a
   * search for either.
   */
  async findActiveMembersByRoles(
    companyId: string,
    roles: CompanyMembershipRole[],
  ): Promise<CompanyMembership[]> {
    if (roles.length === 0) {
      return [];
    }

    return this.membershipsRepository
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.status = :status', {
        status: CompanyMembershipStatus.ACTIVE,
      })
      .andWhere('m.roles && :roles', { roles })
      .orderBy('m.created_at', 'ASC')
      .getMany();
  }
}
