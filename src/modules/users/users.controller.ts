import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PlatformRole } from './enums/platform-role.enum';
import { UsersService } from './users.service';

/**
 * Staff administration for Solutions management. Employees are created here —
 * there is no public sign-up — and each is then put on the clients they work on
 * via `POST /companies/:companyId/members`.
 */
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN, PlatformRole.AGENCY_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
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
  ) {
    return this.usersService.updateEmployee(userId, dto);
  }
}
