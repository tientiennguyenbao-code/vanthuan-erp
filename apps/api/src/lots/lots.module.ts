import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { DocRulesController, DocumentsController, FeeRequestsController, LotDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AllocationsController, ExportLotsController, PurchaseLotsController } from './lots.controller';
import { LotsService } from './lots.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [PurchaseLotsController, ExportLotsController, AllocationsController, LotDocumentsController, DocumentsController, DocRulesController, FeeRequestsController],
  providers: [LotsService, DocumentsService],
})
export class LotsModule {}
