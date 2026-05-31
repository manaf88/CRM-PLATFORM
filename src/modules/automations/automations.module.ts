import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { TasksModule } from '../tasks/tasks.module';
import { AutomationEngineService } from './automation-engine.service';
import { AutomationRulesController } from './automation-rules.controller';
import { AutomationRulesService } from './automation-rules.service';
import { AutomationRunsController } from './automation-runs.controller';
import { AutomationRunsService } from './automation-runs.service';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationRun } from './entities/automation-run.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationRule,
      AutomationRun,
    ]),
    MembershipsModule,
    TasksModule,
  ],
  controllers: [
    AutomationRulesController,
    AutomationRunsController,
  ],
  providers: [
    AutomationRulesService,
    AutomationRunsService,
    AutomationEngineService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [
    AutomationEngineService,
    AutomationRulesService,
    AutomationRunsService,
  ],
})
export class AutomationsModule {}