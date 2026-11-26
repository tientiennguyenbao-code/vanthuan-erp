import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { CreditService } from './credit.service';
import { InquiriesService } from './inquiries.service';
import { PriceFixingService } from './price-fixing.service';
import { ContractProgressController, CreditController, InquiriesController, LotSalesController, SamplesController } from './sales.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [InquiriesController, SamplesController, LotSalesController, ContractProgressController, CreditController],
  providers: [InquiriesService, SamplesService, PriceFixingService, CreditService],
  exports: [InquiriesService, PriceFixingService],
})
export class SalesModule {}
