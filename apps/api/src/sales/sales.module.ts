import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { BuyerPortalService } from './buyer-portal.service';
import { CreditService } from './credit.service';
import { InquiriesService } from './inquiries.service';
import { PriceFixingService } from './price-fixing.service';
import { BuyerPortalController, ContractProgressController, CreditController, InquiriesController, LotSalesController, SamplesController } from './sales.controller';
import { SamplesService } from './samples.service';

@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [InquiriesController, SamplesController, LotSalesController, ContractProgressController, CreditController, BuyerPortalController],
  providers: [BuyerPortalService, InquiriesService, SamplesService, PriceFixingService, CreditService],
  exports: [InquiriesService, PriceFixingService],
})
export class SalesModule {}
