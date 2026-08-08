import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { User } from './entities/user.entity';
import { UsersBootstrapService } from './users-bootstrap.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MembershipsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersBootstrapService, PlatformRolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
