import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CollectionController, ForestController, PortalCollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { ForestService } from './forest.service';
import { PlanController, PortalPlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { PortalSourcingController, SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [SourcingController, PortalSourcingController, CollectionController, PortalCollectionController, ForestController, PlanController, PortalPlanController],
  providers: [SourcingService, CollectionService, ForestService, PlanService],
  exports: [SourcingService, PlanService],
})
export class SourcingModule {}
