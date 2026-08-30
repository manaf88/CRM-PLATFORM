import { Controller, Get, UseGuards } from '@nestjs/common';

import { PlatformRoles } from '../../common/decorators/platform-roles.decorator';
import { PlatformRolesGuard } from '../../common/guards/platform-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformRole } from '../users/enums/platform-role.enum';
import { AdminSystemService } from './admin-system.service';

/**
 * Platform health. Super Admin only — this is infrastructure state rather than
 * agency operations, so an Admin gets a 403 here even though they reach every
 * dashboard route.
 */
@UseGuards(JwtAuthGuard, PlatformRolesGuard)
@PlatformRoles(PlatformRole.SUPER_ADMIN)
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly systemService: AdminSystemService) {}

  @Get('health')
  getHealth() {
    return this.systemService.getHealth();
  }
}
