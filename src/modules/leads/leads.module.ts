import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { LeadNote } from './entities/lead-note.entity';
import { LeadStatusHistory } from './entities/lead-status-history.entity';
import { Lead } from './entities/lead.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationsModule } from '../automations/automations.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadNote,
      LeadStatusHistory,
    ]),
    MembershipsModule,
    NotificationsModule,
    AutomationsModule,
  ],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [LeadsService],
})
export class LeadsModule {}