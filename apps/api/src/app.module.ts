import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContractsModule } from './contracts/contracts.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { LotsModule } from './lots/lots.module';
import { PartnersModule } from './partners/partners.module';
import { QuotesModule } from './quotes/quotes.module';
import { SalesModule } from './sales/sales.module';
import { SettlementModule } from './settlement/settlement.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { UsersModule } from './users/users.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [DbModule, AuditModule, AuthModule, UsersModule, CatalogModule, PartnersModule, ContractsModule, QuotesModule, LotsModule, SettlementModule, SourcingModule, SalesModule, WarehouseModule],
  controllers: [HealthController],
})
export class AppModule {}
