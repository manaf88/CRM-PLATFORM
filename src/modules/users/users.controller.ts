import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePlatformRoleDto } from './dto/update-platform-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PlatformRole } from './enums/platform-role.enum';
import { UsersService } from './users.service';

/**
 * Staff administration for Solutions management. Employees are created here —
 * there is no public sign-up — and each is then put on the clients they work on
 * via `POST /companies/:companyId/members`.
 *
 * Both administrator roles manage employees. Handing out an administrator role
 * is Super Admin only, and lives on its own route.
 */
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.AGENCY_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    this.assertMayAssignRole(currentUser, dto.platformRole);

    const user = await this.usersService.createEmployee(dto);

    return this.usersService.findOneEmployee(user.id);
  }

  @Get()
  findAll() {
    return this.usersService.findAllEmployees();
  }

  @Get(':userId')
  findOne(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.usersService.findOneEmployee(userId);
  }

  @Patch(':userId')
  update(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    // `platformRole` is still accepted here so an existing frontend does not
    // start failing, but only a Super Admin may use it. New code should call
    // PATCH /users/:userId/platform-role instead; this field will be dropped
    // from the body once the frontend has moved over.
    this.assertMayAssignRole(currentUser, dto.platformRole);

    return this.usersService.updateEmployee(userId, dto);
  }

  /** Assign or revoke an administrator role. Super Admin only. */
  @UseGuards(PlatformRolesGuard)
  @PlatformRoles(PlatformRole.SUPER_ADMIN)
  @Patch(':userId/platform-role')
  changePlatformRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdatePlatformRoleDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.usersService.changePlatformRole(
      currentUser.id,
      userId,
      dto.platformRole,
    );
  }

  private assertMayAssignRole(
    currentUser: RequestUser,
    platformRole?: PlatformRole,
  ): void {
    if (
      platformRole !== undefined &&
      currentUser.platformRole !== PlatformRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only a Super Admin can assign a platform role',
      );
    }
  }
}
