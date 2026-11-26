import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContractsModule } from '../contracts/contracts.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [AuditModule, ContractsModule, SourcingModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
