import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
    ) { }

    @Get()
    findMine(
        @CurrentUser() currentUser: RequestUser,
        @Query() query: FindNotificationsQueryDto,
    ) {
        return this.notificationsService.findMine(currentUser, query);
    }

    @Get('unread-count')
    getUnreadCount(@CurrentUser() currentUser: RequestUser) {
        return this.notificationsService.getUnreadCount(currentUser);
    }

    @Patch('read-all')
    markAllAsRead(@CurrentUser() currentUser: RequestUser) {
        return this.notificationsService.markAllAsRead(currentUser);
    }

    @Patch(':notificationId/read')
    markAsRead(
        @CurrentUser() currentUser: RequestUser,
        @Param('notificationId', ParseUUIDPipe) notificationId: string,
    ) {
        return this.notificationsService.markAsRead(
            currentUser,
            notificationId,
        );
    }


}