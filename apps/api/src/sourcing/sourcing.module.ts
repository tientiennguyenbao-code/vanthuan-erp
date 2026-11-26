import { Module } from '@nestjs/common';
import { FILE_STORE, LocalFileStore } from '../documents/file-store';
import { AreaCodeController, PortalAreaCodeController } from './area-code.controller';
import { AreaCodeService } from './area-code.service';
import { CatchController, PortalCatchController } from './catch.controller';
import { CatchService } from './catch.service';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CollectionController, ForestController, PortalCollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { ForestService } from './forest.service';
import { PlanController, PortalPlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PortalSourcingController, SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';
import { PortalSprayController, SprayController } from './spray.controller';
import { SprayService } from './spray.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [SourcingController, PortalSourcingController, CollectionController, PortalCollectionController, ForestController, PlanController, PortalPlanController, SprayController, PortalSprayController, AreaCodeController, PortalAreaCodeController, CatchController, PortalCatchController],
  providers: [SourcingService, CollectionService, ForestService, PlanService, SprayService, AreaCodeService, CatchService, { provide: FILE_STORE, useClass: LocalFileStore }],
  exports: [SourcingService, PlanService],
})
export class SourcingModule {}
