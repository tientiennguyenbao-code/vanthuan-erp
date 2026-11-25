import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { AllocationsController, ExportLotsController, PurchaseLotsController } from './lots.controller';
import { LotsService } from './lots.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [PurchaseLotsController, ExportLotsController, AllocationsController],
  providers: [LotsService],
})
export class LotsModule {}
