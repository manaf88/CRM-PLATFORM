import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { ApprovalQueueQueryDto } from './dto/approval-queue-query.dto';
import { TasksService } from './tasks.service';

/**
 * Everything waiting on one person, across every client they work on.
 *
 * Deliberately not under /companies/:companyId — somebody who approves design
 * for five clients has one queue, not five, and merging them in the frontend
 * means five requests and no way to page correctly.
 */
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MyApprovalQueueController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('approval-queue')
  findApprovalQueue(
    @Query() query: ApprovalQueueQueryDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.findApprovalQueueAcrossCompanies(
      query,
      currentUser,
    );
  }
}
