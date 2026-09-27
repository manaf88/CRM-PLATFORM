import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationPreferencesService } from './notification-preferences.service';

/** A person's own notification settings. Nobody edits anybody else's. */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeNotificationPreferencesController {
  constructor(
    private readonly preferencesService: NotificationPreferencesService,
  ) {}

  @Get('notification-preferences')
  find(@CurrentUser() currentUser: RequestUser) {
    return this.preferencesService.findForUser(currentUser.id);
  }

  @Put('notification-preferences')
  replace(
    @CurrentUser() currentUser: RequestUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.preferencesService.replaceForUser(currentUser.id, dto);
  }
}
