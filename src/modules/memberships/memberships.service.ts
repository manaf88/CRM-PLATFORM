import {
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
  role: CompanyMembershipRole;
  invitedById?: string | null;
};

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(CompanyMembership)
    private readonly membershipsRepository: Repository<CompanyMembership>,
  ) { }

  async create(input: CreateMembershipInput): Promise<CompanyMembership> {
    const existingMembership =
      await this.membershipsRepository.findOne({
        where: {
          companyId: input.companyId,
          userId: input.userId,
        },
      });

    if (existingMembership) {
      throw new ConflictException(
        'User is already a member of this company',
      );
    }

    const membership = this.membershipsRepository.create({
      companyId: input.companyId,
      userId: input.userId,
      role: input.role,
      status: CompanyMembershipStatus.ACTIVE,
      invitedById: input.invitedById ?? null,
    });

    return this.membershipsRepository.save(membership);
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

  async findActiveMembershipRole(
    userId: string,
    companyId: string,
  ): Promise<CompanyMembershipRole | null> {
    const membership = await this.membershipsRepository.findOne({
      where: {
        userId,
        companyId,
        status: CompanyMembershipStatus.ACTIVE,
      },
    });

    return membership?.role ?? null;
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
      role?: CompanyMembershipRole;
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

    if (input.role !== undefined) {
      membership.role = input.role;
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
  async findActiveMembersByRoles(
    companyId: string,
    roles: CompanyMembershipRole[],
  ): Promise<CompanyMembership[]> {
    return this.membershipsRepository.find({
      where: {
        companyId,
        role: In(roles),
        status: CompanyMembershipStatus.ACTIVE,
      },
    });
  }
}