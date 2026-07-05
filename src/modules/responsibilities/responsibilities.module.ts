import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
import { MembershipsModule } from '../memberships/memberships.module';
import { User } from '../users/entities/user.entity';
import { ResponsibilityArea } from './entities/responsibility-area.entity';
import { ResponsibilityAssignment } from './entities/responsibility-assignment.entity';
import { ResponsibilityAreasController } from './responsibility-areas.controller';
import { ResponsibilityAreasService } from './responsibility-areas.service';
import { ResponsibilityAssignmentsController } from './responsibility-assignments.controller';
import { ResponsibilityAssignmentsService } from './responsibility-assignments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ResponsibilityArea,
      ResponsibilityAssignment,
      User,
    ]),
    MembershipsModule,
  ],
  controllers: [
    ResponsibilityAreasController,
    ResponsibilityAssignmentsController,
  ],
  providers: [
    ResponsibilityAreasService,
    ResponsibilityAssignmentsService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [
    ResponsibilityAreasService,
    ResponsibilityAssignmentsService,
  ],
})
export class ResponsibilitiesModule {}