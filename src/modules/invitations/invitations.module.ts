import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { UsersModule } from '../users/users.module';
import { CompanyMembersController } from './company-members.controller';
import { CompanyInvitation } from './entities/company-invitation.entity';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyInvitation]),
    UsersModule,
    MembershipsModule,
  ],
  controllers: [
    InvitationsController,
    CompanyMembersController,
  ],
  providers: [
    InvitationsService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [InvitationsService],
})
export class InvitationsModule {}