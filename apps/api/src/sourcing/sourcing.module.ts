import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CollectionController, ForestController, PortalCollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { ForestService } from './forest.service';
import { PortalSourcingController, SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [AuditModule],
  controllers: [SourcingController, PortalSourcingController, CollectionController, PortalCollectionController, ForestController],
  providers: [SourcingService, CollectionService, ForestService],
  exports: [SourcingService],
})
export class SourcingModule {}
