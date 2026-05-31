import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CompanyRoles } from '../../common/decorators/company-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/types/request-user.type';
import { CompanyMembershipRole } from '../memberships/enums/company-membership-role.enum';
import { AttachTaskFileDto } from './dto/attach-task-file.dto';
import { CreateTaskCommentDto } from './dto/create-task-comment.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksQueryDto } from './dto/find-tasks-query.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

const TASK_VIEW_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.CLIENT_OWNER,
  CompanyMembershipRole.CLIENT_REVIEWER,
  CompanyMembershipRole.SALES_AGENT,
];

const TASK_MANAGE_ROLES = [
  CompanyMembershipRole.ACCOUNT_MANAGER,
  CompanyMembershipRole.COPYWRITER,
  CompanyMembershipRole.DESIGNER,
  CompanyMembershipRole.SOCIAL_MEDIA_MANAGER,
  CompanyMembershipRole.SALES_AGENT,
];

@UseGuards(JwtAuthGuard, CompanyAccessGuard, CompanyRolesGuard)
@Controller('companies/:companyId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @CompanyRoles(...TASK_MANAGE_ROLES)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.create(companyId, dto, currentUser);
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Get()
  findAll(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: FindTasksQueryDto,
  ) {
    return this.tasksService.findAll(companyId, query);
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Get(':taskId')
  findOne(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.findOne(companyId, taskId);
  }

  @CompanyRoles(...TASK_MANAGE_ROLES)
  @Patch(':taskId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.update(
      companyId,
      taskId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...TASK_MANAGE_ROLES)
  @Patch(':taskId/status')
  updateStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.updateStatus(
      companyId,
      taskId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Post(':taskId/comments')
  addComment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateTaskCommentDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.addComment(
      companyId,
      taskId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Get(':taskId/comments')
  findComments(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.findComments(companyId, taskId);
  }

  @CompanyRoles(...TASK_MANAGE_ROLES)
  @Post(':taskId/attachments')
  attachFile(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: AttachTaskFileDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.attachFile(
      companyId,
      taskId,
      dto,
      currentUser,
    );
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Get(':taskId/attachments')
  findAttachments(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.findAttachments(companyId, taskId);
  }

  @CompanyRoles(...TASK_MANAGE_ROLES)
  @Delete(':taskId/attachments/:attachmentId')
  removeAttachment(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    return this.tasksService.removeAttachment(
      companyId,
      taskId,
      attachmentId,
      currentUser,
    );
  }

  @CompanyRoles(...TASK_VIEW_ROLES)
  @Get(':taskId/activity-logs')
  findActivityLogs(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.tasksService.findActivityLogs(companyId, taskId);
  }
}