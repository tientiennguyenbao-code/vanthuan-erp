import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CollectionController, PortalCollectionController } from './collection.controller';
import { CollectionService } from './collection.service';
import { PortalSourcingController, SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

@Module({
  imports: [AuditModule],
  controllers: [SourcingController, PortalSourcingController, CollectionController, PortalCollectionController],
  providers: [SourcingService, CollectionService],
  exports: [SourcingService],
})
export class SourcingModule {}
