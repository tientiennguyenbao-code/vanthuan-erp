import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { FILE_STORE, LocalFileStore } from '../documents/file-store';
import { DocRulesController, DocumentsController, FeeRequestsController, FilesController, LotDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AllocationsController, ExportLotsController, PurchaseLotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { MisaController } from './misa.controller';
import { MisaService } from './misa.service';
import { PartnerPortalAccountsController, PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [PurchaseLotsController, ExportLotsController, AllocationsController, LotDocumentsController, DocumentsController, DocRulesController, FeeRequestsController, FilesController, PortalController, PartnerPortalAccountsController, MisaController],
  providers: [LotsService, DocumentsService, PortalService, MisaService, { provide: FILE_STORE, useClass: LocalFileStore }],
})
export class LotsModule {}
