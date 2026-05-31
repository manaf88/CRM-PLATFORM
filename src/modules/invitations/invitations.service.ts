import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import * as argon2 from 'argon2';

import { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembership } from '../memberships/entities/company-membership.entity';
import { CompanyMembershipStatus } from '../memberships/enums/company-membership-status.enum';
import { MembershipsService } from '../memberships/memberships.service';
import { UsersService } from '../users/users.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateCompanyInvitationDto } from './dto/create-company-invitation.dto';
import { CompanyInvitation } from './entities/company-invitation.entity';
import { InvitationStatus } from './enums/invitation-status.enum';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(CompanyInvitation)
    private readonly invitationsRepository: Repository<CompanyInvitation>,
    private readonly usersService: UsersService,
    private readonly membershipsService: MembershipsService,
  ) {}

  async createInvitation(
    companyId: string,
    dto: CreateCompanyInvitationDto,
    currentUser: RequestUser,
  ) {
    const email = this.usersService.normalizeEmail(dto.email);

    const existingPending = await this.invitationsRepository.findOne({
      where: {
        companyId,
        email,
        status: InvitationStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'There is already a pending invitation for this email',
      );
    }

    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      const existingMembership =
        await this.membershipsService.findByUserAndCompany(
          existingUser.id,
          companyId,
        );

      if (
        existingMembership &&
        existingMembership.status === CompanyMembershipStatus.ACTIVE
      ) {
        throw new ConflictException(
          'User is already an active member of this company',
        );
      }
    }

    const rawSecret = this.generateRawSecret();
    const tokenHash = await argon2.hash(rawSecret, {
      type: argon2.argon2id,
    });

    const invitation = this.invitationsRepository.create({
      companyId,
      email,
      fullName: dto.fullName?.trim() ?? null,
      role: dto.role,
      tokenHash,
      status: InvitationStatus.PENDING,
      invitedById: currentUser.id,
      expiresAt: this.buildExpirationDate(),
    });

    const savedInvitation =
      await this.invitationsRepository.save(invitation);

    const invitationToken = `${savedInvitation.id}.${rawSecret}`;

    return {
      invitation: savedInvitation,
      invitationToken,
      acceptPath: `/auth/accept-invitation?token=${invitationToken}`,
    };
  }

  async findInvitations(companyId: string): Promise<CompanyInvitation[]> {
    return this.invitationsRepository.find({
      where: {
        companyId,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async acceptInvitation(dto: AcceptInvitationDto): Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
    };
    membership: CompanyMembership;
  }> {
    const { invitationId, rawSecret } = this.parseInvitationToken(dto.token);

    const invitation =
      await this.invitationsRepository
        .createQueryBuilder('invitation')
        .addSelect('invitation.tokenHash')
        .where('invitation.id = :invitationId', { invitationId })
        .getOne();

    if (!invitation) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException('Invitation is no longer valid');
    }

    if (invitation.expiresAt.getTime() < Date.now()) {
      invitation.status = InvitationStatus.EXPIRED;
      await this.invitationsRepository.save(invitation);

      throw new BadRequestException('Invitation has expired');
    }

    const isTokenValid = await argon2.verify(
      invitation.tokenHash,
      rawSecret,
    );

    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    let user = await this.usersService.findByEmail(invitation.email);

    if (!user) {
      if (!dto.password) {
        throw new BadRequestException(
          'Password is required for new invited users',
        );
      }

      const fullName =
        dto.fullName?.trim() ||
        invitation.fullName ||
        invitation.email.split('@')[0];

      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });

      user = await this.usersService.create({
        email: invitation.email,
        fullName,
        passwordHash,
      });
    }

    const existingMembership =
      await this.membershipsService.findByUserAndCompany(
        user.id,
        invitation.companyId,
      );

    let membership: CompanyMembership;

    if (existingMembership) {
      if (existingMembership.status === CompanyMembershipStatus.ACTIVE) {
        throw new ConflictException(
          'User is already an active member of this company',
        );
      }

      membership = await this.membershipsService.updateMembership(
        invitation.companyId,
        existingMembership.id,
        {
          role: invitation.role,
          status: CompanyMembershipStatus.ACTIVE,
        },
      );
    } else {
      membership = await this.membershipsService.create({
        companyId: invitation.companyId,
        userId: user.id,
        role: invitation.role,
        invitedById: invitation.invitedById,
      });
    }

    invitation.status = InvitationStatus.ACCEPTED;
    invitation.acceptedById = user.id;
    invitation.acceptedAt = new Date();

    await this.invitationsRepository.save(invitation);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      membership,
    };
  }

  private generateRawSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  private buildExpirationDate(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return expiresAt;
  }

  private parseInvitationToken(token: string): {
    invitationId: string;
    rawSecret: string;
  } {
    const [invitationId, rawSecret] = token.split('.');

    if (!invitationId || !rawSecret) {
      throw new UnauthorizedException('Invalid invitation token');
    }

    return {
      invitationId,
      rawSecret,
    };
  }
}