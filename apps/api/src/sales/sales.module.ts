import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { InquiriesService } from './inquiries.service';
import { PriceFixingService } from './price-fixing.service';
import { ContractProgressController, InquiriesController, LotSalesController, SamplesController } from './sales.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [InquiriesController, SamplesController, LotSalesController, ContractProgressController],
  providers: [InquiriesService, SamplesService, PriceFixingService],
  exports: [InquiriesService, PriceFixingService],
})
export class SalesModule {}
