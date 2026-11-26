import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { ComplaintsService } from './complaints.service';
import { LotFinanceService } from './lot-finance.service';
import { PaymentsService } from './payments.service';
import { ComplaintsController, FinancingsController, LotMoneyController, PaymentsController, PortalPaymentsController, SettlementsController } from './settlement.controller';
import { SettlementsService } from './settlements.service';

/** Thanh toán, tài trợ, khiếu nại và quyết toán lô. */
@Module({
  imports: [AuditModule, ContractsModule],
  controllers: [LotMoneyController, PaymentsController, FinancingsController, ComplaintsController, SettlementsController, PortalPaymentsController],
  providers: [LotFinanceService, PaymentsService, ComplaintsService, SettlementsService],
})
export class SettlementModule {}
