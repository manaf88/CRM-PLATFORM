import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CompanyAccessGuard } from '../../common/guards/company-access.guard';
import { BrandProfilesModule } from '../brand-profiles/brand-profiles.module';
import { ContentModule } from '../content/content.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { AiApplyService } from './ai-apply.service';
import { AiController } from './ai.controller';
import { AiGenerationApplication } from './entities/ai-generation-application.entity';
import { AiGeneration } from './entities/ai-generation.entity';
import { AiGenerationsService } from './ai-generations.service';
import { AiProviderService } from './ai-provider.service';
import { AiService } from './ai.service';
import { PromptBuilderService } from './prompt-builder.service';
import { CompanyRolesGuard } from '../../common/guards/company-roles.guard';
@Module({
  imports: [
    TypeOrmModule.forFeature([AiGeneration, AiGenerationApplication]),
    BrandProfilesModule,
    ContentModule,
    MembershipsModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiApplyService,
    AiProviderService,
    AiGenerationsService,
    PromptBuilderService,
    CompanyAccessGuard,
    CompanyRolesGuard,
  ],
  exports: [
    AiService,
    AiGenerationsService,
  ],
})
export class AiModule {}