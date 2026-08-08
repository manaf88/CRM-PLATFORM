import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import * as argon2 from 'argon2';

import { MembershipsService } from '../memberships/memberships.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { PlatformRole } from './enums/platform-role.enum';
import { UserStatus } from './enums/user-status.enum';

type CreateUserInput = {
  email: string;
  fullName: string;
  passwordHash: string;
  platformRole?: PlatformRole;
};

/** An employee together with the clients they currently work on. */
export type EmployeeView = {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  status: UserStatus;
  createdAt: Date;
  clients: Array<{
    membershipId: string;
    companyId: string;
    companyName: string;
    role: string;
  }>;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly membershipsService: MembershipsService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = this.normalizeEmail(input.email);

    const existingUser = await this.usersRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const user = this.usersRepository.create({
      email,
      fullName: input.fullName.trim(),
      passwordHash: input.passwordHash,
      refreshTokenHash: null,
      ...(input.platformRole ? { platformRole: input.platformRole } : {}),
    });

    return this.usersRepository.save(user);
  }

  /** Create an employee account. Sign-up is administrator-only. */
  async createEmployee(dto: CreateUserDto): Promise<User> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    return this.create({
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
      platformRole: dto.platformRole,
    });
  }

  /** Every employee with the clients they work on. */
  async findAllEmployees(): Promise<EmployeeView[]> {
    const users = await this.usersRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });

    const memberships =
      await this.membershipsService.findActiveMembershipsForUsers(
        users.map((user) => user.id),
      );

    return users.map((user) => ({
      ...this.toEmployeeBase(user),
      clients: memberships
        .filter((membership) => membership.userId === user.id)
        .map((membership) => ({
          membershipId: membership.id,
          companyId: membership.companyId,
          companyName: membership.company?.name ?? '',
          role: membership.role,
        })),
    }));
  }

  async findOneEmployee(userId: string): Promise<EmployeeView> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberships =
      await this.membershipsService.findActiveMembershipsForUsers([user.id]);

    return {
      ...this.toEmployeeBase(user),
      clients: memberships.map((membership) => ({
        membershipId: membership.id,
        companyId: membership.companyId,
        companyName: membership.company?.name ?? '',
        role: membership.role,
      })),
    };
  }

  async updateEmployee(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<EmployeeView> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Patched column by column rather than save()d: passwordHash and
    // refreshTokenHash are `select: false`, so a loaded entity does not carry
    // them and saving it whole risks writing them away.
    const patch: Partial<
      Pick<
        User,
        | 'fullName'
        | 'platformRole'
        | 'status'
        | 'passwordHash'
        | 'refreshTokenHash'
      >
    > = {};

    if (dto.fullName !== undefined) {
      patch.fullName = dto.fullName.trim();
    }

    if (dto.platformRole !== undefined) {
      patch.platformRole = dto.platformRole;
    }

    if (dto.status !== undefined) {
      patch.status = dto.status;

      // Losing access means the existing session must not survive.
      if (dto.status !== UserStatus.ACTIVE) {
        patch.refreshTokenHash = null;
      }
    }

    if (dto.password !== undefined) {
      patch.passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      patch.refreshTokenHash = null;
    }

    if (Object.keys(patch).length > 0) {
      await this.usersRepository.update({ id: user.id }, patch);
    }

    return this.findOneEmployee(user.id);
  }

  private toEmployeeBase(
    user: User,
  ): Omit<EmployeeView, 'clients'> {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: {
        email: this.normalizeEmail(email),
      },
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', {
        email: this.normalizeEmail(email),
      })
      .getOne();
  }

  async findActiveById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: {
        id,
        status: UserStatus.ACTIVE,
      },
    });
  }

  async findActiveByIdWithRefreshTokenHash(
    id: string,
  ): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .getOne();
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { refreshTokenHash },
    );
  }

  async clearRefreshTokenHash(userId: string): Promise<void> {
    await this.usersRepository.update(
      { id: userId },
      { refreshTokenHash: null },
    );
  }
}